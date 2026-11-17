// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ISystemContract} from "reactive-lib/src/interfaces/ISystemContract.sol";
import {AbstractReactive} from "reactive-lib/src/base/AbstractReactive.sol";
import {Journal} from "./Journal.sol";

/// @title PortfolioAutopilot — "set it and forget it" for a cross-chain portfolio
/// @notice A reactive contract on Reactive Lasna that:
///   1. TRACKS — keeps a live, on-chain ledger of one wallet's tETH/tUSD across Ethereum Sepolia,
///      Base Sepolia and Unichain Sepolia by listening to ERC-20 `Transfer` events in and out of it
///      (plus the rebalancer vault), with `Checkpoint` events from a beacon on each chain as ground truth;
///   2. PRICES — reads the tETH price from a Uniswap-V2-style pool's `Sync` events;
///   3. REBALANCES — when the cross-chain ETH share leaves its band (e.g. 60% ± 5%) it calls the
///      vault on Base Sepolia to trade back to target;
///   4. ALERTS — when the price leaves (or re-enters) your LP range it writes an alert to the Journal;
///   5. JOURNALS — on Reactive's cron it writes a snapshot to the Journal and asks every beacon to
///      re-publish real balances, so the books self-heal.
/// On Reactive Omni there is no separate ReactVM, so all of this state is readable with eth_call.
contract PortfolioAutopilot is AbstractReactive {
    // ───────────────────────── constants ─────────────────────────
    uint256 internal constant TRANSFER_TOPIC0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef;
    uint256 internal constant SYNC_TOPIC0 = 0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1;
    uint256 internal constant CHECKPOINT_TOPIC0 = uint256(keccak256("Checkpoint(address,address,uint256)"));
    uint256 internal constant REBALANCED_TOPIC0 =
        uint256(keccak256("Rebalanced(uint256,bool,uint256,uint256,uint256)"));
    uint256 internal constant SKIPPED_TOPIC0 = uint256(keccak256("RebalanceSkipped(uint256,uint8)"));
    uint256 internal constant SNAPSHOT_RECORDED_TOPIC0 =
        uint256(keccak256("SnapshotRecorded(uint256,uint256,uint16,uint256)"));
    uint256 internal constant RANGE_ALERT_TOPIC0 =
        uint256(keccak256("RangeAlert(uint256,uint8,uint256,uint256,uint256)"));

    address internal constant CRON_SOURCE = 0x0000000000000000000000000000000000fffFfF;
    /// @dev Cron1000 ≈ every 1,000 Lasna blocks (~17 min). Snapshots are time-gated on top of it.
    uint256 internal constant CRON1000_TOPIC0 = 0xe20b31294d84c3661ddc8f423abb9c70310d0cf172aa2714ead78029b325e3f4;

    uint64 internal constant GAS_REBALANCE = 500_000;
    uint64 internal constant GAS_JOURNAL = 600_000;
    uint64 internal constant GAS_RESYNC = 400_000;

    uint8 public constant ASSET_ETH = 1;
    uint8 public constant ASSET_USD = 2;

    uint8 public constant RANGE_UNKNOWN = 0;
    uint8 public constant RANGE_IN = 1;
    uint8 public constant RANGE_BELOW = 2;
    uint8 public constant RANGE_ABOVE = 3;

    uint256 public constant CHAINS = 3;

    // ───────────────────────── types ─────────────────────────
    struct Config {
        address wallet;
        uint256[3] chainIds;
        address[3] ethTokens;
        address[3] usdTokens;
        uint256 vaultChainId;
        uint256 priceChainId;
        address pricePool;
        bool priceEthIsToken0;
        uint256 lpChainId;
        address lpPool;
        bool lpEthIsToken0;
        uint16 targetEthBps;
        uint16 bandBps;
    }

    struct Rules {
        uint16 targetEthBps; // desired ETH share of total value, e.g. 6000 = 60%
        uint16 bandBps; // allowed drift either side, e.g. 500 = ±5%
        uint16 slippageBps; // tolerance passed to the vault as minOut
        uint32 cooldown; // seconds between rebalance requests
        uint32 pendingTimeout; // seconds before an unanswered request may be retried
        uint256 minTradeUsd; // ignore dust trades (1e18 = $1)
    }

    struct Portfolio {
        uint256 ethUnits;
        uint256 usdUnits;
        uint256 priceE18;
        uint256 totalUsd;
        uint16 ethShareBps;
        uint256[3] chainEth;
        uint256[3] chainUsd;
        uint256[3] chainValueUsd;
    }

    // ───────────────────────── events ─────────────────────────
    event HoldingChanged(
        uint256 indexed chainId, address indexed token, address indexed holder, uint256 balance, uint256 originTx
    );
    event PriceUpdated(uint256 indexed chainId, address indexed pool, uint256 priceE18, uint256 originTx);
    event RebalanceRequested(
        uint256 indexed nonce,
        bool sellEth,
        uint256 amountIn,
        uint256 minOut,
        uint16 ethShareBps,
        uint256 originChainId,
        uint256 originTx
    );
    event RebalanceSettled(uint256 indexed nonce, bool executed, uint256 originTx);
    event RangeAlertRequested(
        uint8 indexed kind,
        uint256 priceE18,
        uint256 lowerE18,
        uint256 upperE18,
        uint256 originChainId,
        uint256 originTx
    );
    event SnapshotRequested(uint256 indexed id, uint256 totalUsd, uint16 ethShareBps);
    event ResyncRequested(uint256 indexed chainId, address beacon);
    /// @notice A journal callback landed on the destination chain (kind 1 = snapshot, 2 = alert).
    event CallbackLanded(uint8 indexed kind, uint256 indexed id, uint256 chainId, uint256 destTx);
    event RulesUpdated(Rules rules);
    event RangeUpdated(uint256 lowerE18, uint256 upperE18);
    event PausedSet(bool paused);

    error NotOwner();
    error UnknownChain(uint256 chainId);
    error BadRules();

    // ───────────────────────── storage ─────────────────────────
    address public immutable owner;
    address public immutable wallet;
    uint256 public immutable vaultChainId;
    uint256 public immutable priceChainId;
    address public immutable pricePool;
    bool public immutable priceEthIsToken0;
    uint256 public immutable lpChainId;
    address public immutable lpPool;
    bool public immutable lpEthIsToken0;

    uint256[3] public chainIds;
    address[3] public ethTokens;
    address[3] public usdTokens;

    mapping(uint256 => uint256) internal _chainIndexPlusOne;
    mapping(uint256 => mapping(address => uint8)) public assetOf; // chainId => token => ASSET_*
    mapping(uint256 => mapping(address => bool)) public isHolder; // chainId => holder => tracked
    mapping(uint256 => mapping(address => mapping(address => uint256))) public balanceOf; // chain => token => holder
    mapping(uint256 => uint256[3]) internal _units; // chainIndex => [unused, eth, usd]
    mapping(bytes32 => bool) internal _seen; // de-dupes a log matched by two subscriptions

    address public vault;
    address public journal;
    mapping(uint256 => address) public beaconOf; // chainId => beacon

    Rules public rules;
    bool public paused;

    uint256 public ethPriceE18;
    uint256 public priceUpdatedAt;

    uint256 public lpLowerE18;
    uint256 public lpUpperE18;
    uint256 public lpPriceE18;
    uint8 public rangeState;

    uint256 public nonce;
    uint256 public pendingNonce;
    uint256 public pendingSince;
    uint256 public lastRebalanceAt;

    uint32 public snapshotInterval;
    bool public resyncOnSnapshot;
    /// @dev Next beacon to re-sync (index+1); re-syncs are spread over cron ticks to stay under the gas cap.
    uint8 public resyncCursor;
    uint256 public lastSnapshotAt;
    uint256 public snapshotCount;

    uint256 public reactCount;
    uint256 public lastReactAt;
    uint256 public lastOriginTx;
    uint256 public lastOriginChainId;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(Config memory c) payable {
        owner = msg.sender;
        wallet = c.wallet;
        vaultChainId = c.vaultChainId;
        priceChainId = c.priceChainId;
        pricePool = c.pricePool;
        priceEthIsToken0 = c.priceEthIsToken0;
        lpChainId = c.lpChainId;
        lpPool = c.lpPool;
        lpEthIsToken0 = c.lpEthIsToken0;

        for (uint256 i; i < CHAINS; ++i) {
            chainIds[i] = c.chainIds[i];
            ethTokens[i] = c.ethTokens[i];
            usdTokens[i] = c.usdTokens[i];
            _chainIndexPlusOne[c.chainIds[i]] = i + 1;
            assetOf[c.chainIds[i]][c.ethTokens[i]] = ASSET_ETH;
            assetOf[c.chainIds[i]][c.usdTokens[i]] = ASSET_USD;
            isHolder[c.chainIds[i]][c.wallet] = true;
        }
        if (_chainIndexPlusOne[c.vaultChainId] == 0) revert UnknownChain(c.vaultChainId);

        _setRules(
            Rules({
                targetEthBps: c.targetEthBps,
                bandBps: c.bandBps,
                slippageBps: 200,
                cooldown: 120,
                pendingTimeout: 900,
                minTradeUsd: 10e18
            })
        );
        snapshotInterval = 1 days;
        resyncOnSnapshot = true;

        // Subscriptions: wallet in/out on every chain, the two pools, and the cron.
        for (uint256 i; i < CHAINS; ++i) {
            _subTransfers(c.chainIds[i], c.wallet, true);
        }
        _sub(c.priceChainId, c.pricePool, SYNC_TOPIC0, REACTIVE_IGNORE);
        if (c.lpPool != c.pricePool || c.lpChainId != c.priceChainId) {
            _sub(c.lpChainId, c.lpPool, SYNC_TOPIC0, REACTIVE_IGNORE);
        }
        _sub(block.chainid, CRON_SOURCE, CRON1000_TOPIC0, REACTIVE_IGNORE);
    }

    // ───────────────────────── reactive entry point ─────────────────────────

    /// @dev Never reverts on unexpected input (reverts are still billed); it just ignores the log.
    function react(LogRecord calldata log) external onlySystem {
        reactCount += 1;
        lastReactAt = block.timestamp;
        lastOriginChainId = log.chainId;

        uint256 t0 = log.topic0;
        if (t0 == CRON1000_TOPIC0 && log.contractAddress == CRON_SOURCE) {
            _onCron(log.txHash);
            return;
        }
        lastOriginTx = log.txHash;

        if (t0 == TRANSFER_TOPIC0) {
            if (log.opCode == 3) _onTransfer(log);
        } else if (t0 == SYNC_TOPIC0) {
            _onSync(log);
        } else if (t0 == CHECKPOINT_TOPIC0) {
            _onCheckpoint(log);
        } else if (t0 == REBALANCED_TOPIC0 || t0 == SKIPPED_TOPIC0) {
            _onSettled(log, t0 == REBALANCED_TOPIC0);
        } else if (t0 == SNAPSHOT_RECORDED_TOPIC0 || t0 == RANGE_ALERT_TOPIC0) {
            if (log.chainId == vaultChainId && log.contractAddress == journal && journal != address(0)) {
                emit CallbackLanded(t0 == SNAPSHOT_RECORDED_TOPIC0 ? 1 : 2, log.topic1, log.chainId, log.txHash);
            }
        }
    }

    function _onTransfer(LogRecord calldata log) internal {
        uint256 chainId = log.chainId;
        address token = log.contractAddress;
        if (assetOf[chainId][token] == 0) return;

        bytes32 key = keccak256(abi.encode(chainId, log.txHash, log.logIndex));
        if (_seen[key]) return;
        _seen[key] = true;

        address from = address(uint160(log.topic1));
        address to = address(uint160(log.topic2));
        uint256 amount = abi.decode(log.data, (uint256));
        bool touched;

        if (isHolder[chainId][from]) {
            uint256 bal = balanceOf[chainId][token][from];
            _setBalance(chainId, token, from, bal > amount ? bal - amount : 0, log.txHash);
            touched = true;
        }
        if (isHolder[chainId][to]) {
            _setBalance(chainId, token, to, balanceOf[chainId][token][to] + amount, log.txHash);
            touched = true;
        }
        if (touched) _evaluate(log.txHash);
    }

    function _onSync(LogRecord calldata log) internal {
        (uint112 r0, uint112 r1) = abi.decode(log.data, (uint112, uint112));
        bool matched;

        if (log.chainId == priceChainId && log.contractAddress == pricePool) {
            uint256 p = _price(r0, r1, priceEthIsToken0);
            if (p != 0) {
                ethPriceE18 = p;
                priceUpdatedAt = block.timestamp;
                emit PriceUpdated(log.chainId, log.contractAddress, p, log.txHash);
                matched = true;
            }
        }
        if (log.chainId == lpChainId && log.contractAddress == lpPool) {
            uint256 p = _price(r0, r1, lpEthIsToken0);
            if (p != 0) {
                lpPriceE18 = p;
                if (log.contractAddress != pricePool || log.chainId != priceChainId) {
                    emit PriceUpdated(log.chainId, log.contractAddress, p, log.txHash);
                }
                _checkRange(p, log.txHash);
            }
        }
        if (matched) _evaluate(log.txHash);
    }

    function _onCheckpoint(LogRecord calldata log) internal {
        uint256 chainId = log.chainId;
        if (log.contractAddress != beaconOf[chainId] || log.contractAddress == address(0)) return;
        address holder = address(uint160(log.topic1));
        address token = address(uint160(log.topic2));
        if (!isHolder[chainId][holder] || assetOf[chainId][token] == 0) return;

        uint256 bal = abi.decode(log.data, (uint256));
        if (bal != balanceOf[chainId][token][holder]) {
            _setBalance(chainId, token, holder, bal, log.txHash);
            _evaluate(log.txHash);
        }
    }

    function _onSettled(LogRecord calldata log, bool executed) internal {
        if (log.chainId != vaultChainId || log.contractAddress != vault || vault == address(0)) return;
        uint256 n = log.topic1;
        if (n == pendingNonce && n != 0) {
            pendingNonce = 0;
            if (executed) lastRebalanceAt = block.timestamp;
        }
        emit RebalanceSettled(n, executed, log.txHash);
    }

    /// @dev One heavy action per tick keeps every reactive tx well under the 900k gas cap:
    ///      snapshot → one beacon re-sync per tick → otherwise retry a pending/cooled-down rebalance.
    function _onCron(uint256 cronTx) internal {
        if (lastSnapshotAt == 0 || block.timestamp >= lastSnapshotAt + snapshotInterval) {
            _snapshot();
            if (resyncOnSnapshot) resyncCursor = 1;
            return;
        }
        if (resyncCursor != 0) {
            uint256 i = resyncCursor - 1;
            resyncCursor = i + 1 < CHAINS ? uint8(i + 2) : 0;
            _resyncOne(i);
            return;
        }
        // Retry a rebalance that timed out or was blocked by the cooldown.
        _evaluate(cronTx);
    }

    // ───────────────────────── decisions ─────────────────────────

    /// @dev Decide whether the cross-chain allocation needs a rebalance, and if so request one.
    function _evaluate(uint256 originTx) internal {
        if (paused || ethPriceE18 == 0 || vault == address(0)) return;

        if (pendingNonce != 0) {
            if (block.timestamp < pendingSince + rules.pendingTimeout) return;
            emit RebalanceSettled(pendingNonce, false, 0); // timed out, allow a retry
            pendingNonce = 0;
        }
        if (lastRebalanceAt != 0 && block.timestamp < lastRebalanceAt + rules.cooldown) return;

        Portfolio memory p = portfolio();
        if (p.totalUsd == 0) return;

        uint256 target = (p.totalUsd * rules.targetEthBps) / 10_000;
        uint256 ethValue = p.totalUsd - p.usdUnits;
        uint256 idx = _chainIndexPlusOne[vaultChainId] - 1;
        bool sellEth;
        uint256 tradeUsd;

        if (p.ethShareBps > uint256(rules.targetEthBps) + rules.bandBps) {
            sellEth = true;
            tradeUsd = ethValue - target;
            uint256 vaultEthUsd = (balanceOf[vaultChainId][ethTokens[idx]][vault] * p.priceE18) / 1e18;
            if (tradeUsd > vaultEthUsd) tradeUsd = vaultEthUsd;
        } else if (p.ethShareBps + rules.bandBps < rules.targetEthBps) {
            tradeUsd = target - ethValue;
            uint256 vaultUsd = balanceOf[vaultChainId][usdTokens[idx]][vault];
            if (tradeUsd > vaultUsd) tradeUsd = vaultUsd;
        } else {
            return; // inside the band — nothing to do
        }
        if (tradeUsd < rules.minTradeUsd) return;

        uint256 amountIn;
        uint256 expectedOut;
        if (sellEth) {
            amountIn = (tradeUsd * 1e18) / p.priceE18;
            expectedOut = tradeUsd;
        } else {
            amountIn = tradeUsd;
            expectedOut = (tradeUsd * 1e18) / p.priceE18;
        }
        // 0.3% pool fee + slippage tolerance.
        uint256 minOut = (expectedOut * 997 * (10_000 - rules.slippageBps)) / (1000 * 10_000);

        nonce += 1;
        pendingNonce = nonce;
        pendingSince = block.timestamp;
        _callback(
            vaultChainId,
            vault,
            GAS_REBALANCE,
            abi.encodeWithSignature(
                "rebalance(address,uint256,bool,uint256,uint256)", address(0), nonce, sellEth, amountIn, minOut
            )
        );
        emit RebalanceRequested(
            nonce, sellEth, amountIn, minOut, p.ethShareBps, originTx == 0 ? 0 : lastOriginChainId, originTx
        );
    }

    function _checkRange(uint256 price, uint256 originTx) internal {
        if (lpUpperE18 == 0 || journal == address(0)) return;
        uint8 next = price < lpLowerE18 ? RANGE_BELOW : (price > lpUpperE18 ? RANGE_ABOVE : RANGE_IN);
        uint8 prev = rangeState;
        if (next == prev) return;
        rangeState = next;
        // The first in-range reading is just the starting state, not news.
        if (prev == RANGE_UNKNOWN && next == RANGE_IN) return;
        if (paused) return;

        _callback(
            vaultChainId,
            journal,
            GAS_JOURNAL,
            abi.encodeWithSelector(
                Journal.recordAlert.selector,
                address(0),
                Journal.Alert({
                    timestamp: uint64(block.timestamp),
                    kind: next,
                    priceE18: price,
                    lowerE18: lpLowerE18,
                    upperE18: lpUpperE18
                })
            )
        );
        emit RangeAlertRequested(next, price, lpLowerE18, lpUpperE18, lastOriginChainId, originTx);
    }

    function _snapshot() internal {
        lastSnapshotAt = block.timestamp;
        if (journal != address(0)) {
            Portfolio memory p = portfolio();
            _callback(
                vaultChainId,
                journal,
                GAS_JOURNAL,
                abi.encodeWithSelector(
                    Journal.recordSnapshot.selector,
                    address(0),
                    Journal.Snapshot({
                        timestamp: uint64(block.timestamp),
                        lasnaBlock: uint64(block.number),
                        totalUsd: p.totalUsd,
                        ethUnits: p.ethUnits,
                        usdUnits: p.usdUnits,
                        priceE18: p.priceE18,
                        ethShareBps: p.ethShareBps,
                        targetBps: rules.targetEthBps,
                        chainValueUsd: p.chainValueUsd
                    })
                )
            );
            emit SnapshotRequested(snapshotCount, p.totalUsd, p.ethShareBps);
            snapshotCount += 1;
        }
    }

    function _resyncAll() internal {
        for (uint256 i; i < CHAINS; ++i) {
            _resyncOne(i);
        }
    }

    function _resyncOne(uint256 i) internal {
        address b = beaconOf[chainIds[i]];
        if (b == address(0)) return;
        _callback(chainIds[i], b, GAS_RESYNC, abi.encodeWithSignature("resync(address)", address(0)));
        emit ResyncRequested(chainIds[i], b);
    }

    // ───────────────────────── views ─────────────────────────

    /// @notice Live cross-chain portfolio, valued at the latest pool price.
    function portfolio() public view returns (Portfolio memory p) {
        p.priceE18 = ethPriceE18;
        uint256 ethValue;
        for (uint256 i; i < CHAINS; ++i) {
            uint256[3] storage u = _units[i];
            p.chainEth[i] = u[ASSET_ETH];
            p.chainUsd[i] = u[ASSET_USD];
            p.chainValueUsd[i] = (u[ASSET_ETH] * p.priceE18) / 1e18 + u[ASSET_USD];
            p.ethUnits += u[ASSET_ETH];
            p.usdUnits += u[ASSET_USD];
        }
        ethValue = (p.ethUnits * p.priceE18) / 1e18;
        p.totalUsd = ethValue + p.usdUnits;
        if (p.totalUsd != 0) p.ethShareBps = uint16((ethValue * 10_000) / p.totalUsd);
    }

    /// @notice Single call for the dashboard header.
    function status()
        external
        view
        returns (
            bool paused_,
            uint256 reactCount_,
            uint256 lastReactAt_,
            uint256 pendingNonce_,
            uint256 nonce_,
            uint256 lastRebalanceAt_,
            uint256 snapshotCount_,
            uint256 lastSnapshotAt_,
            uint8 rangeState_,
            uint256 lpPriceE18_
        )
    {
        return (
            paused,
            reactCount,
            lastReactAt,
            pendingNonce,
            nonce,
            lastRebalanceAt,
            snapshotCount,
            lastSnapshotAt,
            rangeState,
            lpPriceE18
        );
    }

    // ───────────────────────── owner controls ─────────────────────────

    /// @notice Register the vault (deployed after this contract, with this contract as its sender).
    function setVault(address vault_) external onlyOwner {
        address old = vault;
        if (old != address(0)) {
            isHolder[vaultChainId][old] = false;
            _subTransfers(vaultChainId, old, false);
            _unsub(vaultChainId, old, REBALANCED_TOPIC0, REACTIVE_IGNORE);
            _unsub(vaultChainId, old, SKIPPED_TOPIC0, REACTIVE_IGNORE);
        }
        vault = vault_;
        pendingNonce = 0;
        if (vault_ != address(0)) {
            isHolder[vaultChainId][vault_] = true;
            _subTransfers(vaultChainId, vault_, true);
            _sub(vaultChainId, vault_, REBALANCED_TOPIC0, REACTIVE_IGNORE);
            _sub(vaultChainId, vault_, SKIPPED_TOPIC0, REACTIVE_IGNORE);
        }
    }

    function setJournal(address journal_) external onlyOwner {
        address old = journal;
        if (old != address(0)) {
            _unsub(vaultChainId, old, SNAPSHOT_RECORDED_TOPIC0, REACTIVE_IGNORE);
            _unsub(vaultChainId, old, RANGE_ALERT_TOPIC0, REACTIVE_IGNORE);
        }
        journal = journal_;
        if (journal_ != address(0)) {
            _sub(vaultChainId, journal_, SNAPSHOT_RECORDED_TOPIC0, REACTIVE_IGNORE);
            _sub(vaultChainId, journal_, RANGE_ALERT_TOPIC0, REACTIVE_IGNORE);
        }
    }

    function setBeacon(uint256 chainId, address beacon) external onlyOwner {
        if (_chainIndexPlusOne[chainId] == 0) revert UnknownChain(chainId);
        address old = beaconOf[chainId];
        if (old != address(0)) _unsub(chainId, old, CHECKPOINT_TOPIC0, REACTIVE_IGNORE);
        beaconOf[chainId] = beacon;
        if (beacon != address(0)) _sub(chainId, beacon, CHECKPOINT_TOPIC0, REACTIVE_IGNORE);
    }

    function setRules(Rules calldata r) external onlyOwner {
        _setRules(r);
    }

    function setRange(uint256 lowerE18, uint256 upperE18) external onlyOwner {
        if (upperE18 != 0 && lowerE18 >= upperE18) revert BadRules();
        lpLowerE18 = lowerE18;
        lpUpperE18 = upperE18;
        rangeState = RANGE_UNKNOWN;
        emit RangeUpdated(lowerE18, upperE18);
    }

    function setSnapshotSchedule(uint32 interval, bool resync) external onlyOwner {
        snapshotInterval = interval;
        resyncOnSnapshot = resync;
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    /// @notice Write a snapshot (and re-sync balances) right now instead of waiting for the cron.
    function snapshotNow() external onlyOwner {
        _snapshot();
        if (resyncOnSnapshot) _resyncAll();
    }

    /// @notice Ask every beacon to re-publish real balances now.
    function resyncNow() external onlyOwner {
        _resyncAll();
    }

    /// @notice Re-run the rebalance check now (e.g. after changing the rules).
    function evaluateNow() external onlyOwner {
        _evaluate(0);
    }

    function coverDebt() external {
        _coverDebt();
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw");
    }

    // ───────────────────────── internals ─────────────────────────

    function _setBalance(uint256 chainId, address token, address holder, uint256 bal, uint256 originTx) internal {
        uint256 old = balanceOf[chainId][token][holder];
        balanceOf[chainId][token][holder] = bal;
        uint256[3] storage u = _units[_chainIndexPlusOne[chainId] - 1];
        uint8 kind = assetOf[chainId][token];
        u[kind] = u[kind] + bal - old;
        emit HoldingChanged(chainId, token, holder, bal, originTx);
    }

    function _price(uint112 r0, uint112 r1, bool ethIsToken0) internal pure returns (uint256) {
        (uint256 rEth, uint256 rUsd) = ethIsToken0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        return rEth == 0 ? 0 : (rUsd * 1e18) / rEth;
    }

    function _setRules(Rules memory r) internal {
        if (r.targetEthBps > 10_000 || r.bandBps == 0 || r.bandBps > 5_000 || r.slippageBps >= 10_000) {
            revert BadRules();
        }
        rules = r;
        emit RulesUpdated(r);
    }

    function _callback(uint256 chainId, address recipient, uint64 gas, bytes memory payload) internal {
        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: chainId, recipient: recipient, gasLimit: gas, payload: payload
            })
        );
    }

    /// @dev Transfers out of and into `holder` for both tracked tokens on `chainId`.
    function _subTransfers(uint256 chainId, address holder, bool on) internal {
        uint256 idx = _chainIndexPlusOne[chainId] - 1;
        address[2] memory tokens = [ethTokens[idx], usdTokens[idx]];
        uint256 h = uint256(uint160(holder));
        for (uint256 k; k < 2; ++k) {
            if (on) {
                SYSTEM.subscribe(chainId, tokens[k], TRANSFER_TOPIC0, h, REACTIVE_IGNORE, REACTIVE_IGNORE);
                SYSTEM.subscribe(chainId, tokens[k], TRANSFER_TOPIC0, REACTIVE_IGNORE, h, REACTIVE_IGNORE);
            } else {
                SYSTEM.unsubscribe(chainId, tokens[k], TRANSFER_TOPIC0, h, REACTIVE_IGNORE, REACTIVE_IGNORE);
                SYSTEM.unsubscribe(chainId, tokens[k], TRANSFER_TOPIC0, REACTIVE_IGNORE, h, REACTIVE_IGNORE);
            }
        }
    }

    function _sub(uint256 chainId, address c, uint256 t0, uint256 t1) internal {
        SYSTEM.subscribe(chainId, c, t0, t1, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function _unsub(uint256 chainId, address c, uint256 t0, uint256 t1) internal {
        SYSTEM.unsubscribe(chainId, c, t0, t1, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }
}
