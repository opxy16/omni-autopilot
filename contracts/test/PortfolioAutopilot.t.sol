// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IReactive} from "reactive-lib/src/interfaces/IReactive.sol";
import {IPayable} from "reactive-lib/src/interfaces/IPayable.sol";
import {AbstractPayer} from "reactive-lib/src/base/AbstractPayer.sol";
import {AbstractCallback} from "reactive-lib/src/base/AbstractCallback.sol";
import {OmniHarness} from "./utils/OmniHarness.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {DemoPool} from "../src/DemoPool.sol";
import {IERC20Min} from "../src/interfaces/IERC20Min.sol";
import {BalanceBeacon} from "../src/BalanceBeacon.sol";
import {RebalancerVault} from "../src/RebalancerVault.sol";
import {Journal} from "../src/Journal.sol";
import {PortfolioAutopilot} from "../src/PortfolioAutopilot.sol";

contract PortfolioAutopilotTest is OmniHarness {
    uint256 constant SEP = 11155111;
    uint256 constant BASE = 84532;
    uint256 constant UNI = 1301;

    address wallet = makeAddr("wallet");
    address stranger = makeAddr("stranger");
    address friend = makeAddr("friend");

    DemoToken[3] eth;
    DemoToken[3] usd;
    DemoPool basePool;
    DemoPool uniPool;
    PortfolioAutopilot ap;
    RebalancerVault vault;
    Journal journal;
    BalanceBeacon[3] beacons;
    uint256[3] ids = [SEP, BASE, UNI];

    function setUp() public {
        vm.warp(1_760_000_000);
        _installSystem();
        proxyOf[SEP] = makeAddr("proxySep");
        proxyOf[BASE] = makeAddr("proxyBase");
        proxyOf[UNI] = makeAddr("proxyUni");

        for (uint256 i; i < 3; ++i) {
            eth[i] = new DemoToken("Test ETH", "tETH", 1e18);
            usd[i] = new DemoToken("Test USD", "tUSD", 1000e18);
            _onChain(address(eth[i]), ids[i]);
            _onChain(address(usd[i]), ids[i]);
        }
        basePool = _pool(1, 1000e18, 2_000_000e18); // $2,000
        uniPool = _pool(2, 1000e18, 2_000_000e18);

        PortfolioAutopilot.Config memory c;
        c.wallet = wallet;
        c.chainIds = ids;
        c.ethTokens = [address(eth[0]), address(eth[1]), address(eth[2])];
        c.usdTokens = [address(usd[0]), address(usd[1]), address(usd[2])];
        c.vaultChainId = BASE;
        c.priceChainId = BASE;
        c.pricePool = address(basePool);
        c.priceEthIsToken0 = true;
        c.lpChainId = UNI;
        c.lpPool = address(uniPool);
        c.lpEthIsToken0 = true;
        c.targetEthBps = 6000;
        c.bandBps = 500;
        ap = new PortfolioAutopilot(c);
        rc = IReactive(payable(address(ap)));

        vault = new RebalancerVault(
            IPayable(payable(proxyOf[BASE])),
            address(ap),
            IERC20Min(address(eth[1])),
            IERC20Min(address(usd[1])),
            basePool,
            60
        );
        journal = new Journal(IPayable(payable(proxyOf[BASE])), address(ap));
        _onChain(address(vault), BASE);
        _onChain(address(journal), BASE);
        for (uint256 i; i < 3; ++i) {
            address[] memory toks = new address[](2);
            toks[0] = address(eth[i]);
            toks[1] = address(usd[i]);
            address[] memory holders = new address[](ids[i] == BASE ? 2 : 1);
            holders[0] = wallet;
            if (ids[i] == BASE) holders[1] = address(vault);
            beacons[i] = new BalanceBeacon(IPayable(payable(proxyOf[ids[i]])), address(ap), toks, holders);
            _onChain(address(beacons[i]), ids[i]);
            ap.setBeacon(ids[i], address(beacons[i]));
        }
        ap.setVault(address(vault));
        ap.setJournal(address(journal));

        vm.recordLogs();
    }

    function _pool(uint256 i, uint256 e, uint256 u) internal returns (DemoPool p) {
        p = new DemoPool(IERC20Min(address(eth[i])), IERC20Min(address(usd[i])));
        _onChain(address(p), ids[i]);
        eth[i].mint(address(this), e);
        usd[i].mint(address(this), u);
        eth[i].approve(address(p), type(uint256).max);
        usd[i].approve(address(p), type(uint256).max);
        p.addLiquidity(e, u);
    }

    /// Standard starting book: wallet 2 tETH on Sepolia, 2,000 tUSD on Unichain; vault 3 tETH + 4,000 tUSD on Base.
    /// = 5 tETH ($10,000) + 6,000 tUSD = $16,000, ETH share 62.5% (inside 60% ± 5%).
    function _seed() internal {
        eth[0].mint(wallet, 2e18);
        usd[2].mint(wallet, 2000e18);
        eth[1].mint(address(vault), 3e18);
        usd[1].mint(address(vault), 4000e18);
        basePool.sync(); // pool liquidity predates the autopilot; publish the price once
        _pump();
    }

    function _nudgePrice(uint256 i, bool up, uint256 amount) internal {
        DemoPool p = i == 1 ? basePool : uniPool;
        if (up) {
            usd[i].mint(address(this), amount);
            p.swap(address(usd[i]), amount, 0, address(this));
        } else {
            eth[i].mint(address(this), amount);
            p.swap(address(eth[i]), amount, 0, address(this));
        }
    }

    // ─────────────────────────── setup & subscriptions ───────────────────────────

    function test_constructorSubscribesEverything() public view {
        // wallet in/out × 2 tokens × 3 chains = 12, two pools, cron = 15;
        // + vault in/out × 2 tokens (4) + vault result events (2) + 3 beacons + 2 journal events = 26
        assertEq(sys.activeSubCount(address(ap)), 26);
        assertEq(ap.owner(), address(this));
        (uint16 target, uint16 band,,,,) = ap.rules();
        assertEq(target, 6000);
        assertEq(band, 500);
    }

    function test_setVaultReplacesSubscriptions() public {
        address v2 = makeAddr("vault2");
        ap.setVault(v2);
        assertEq(sys.activeSubCount(address(ap)), 26);
        assertFalse(ap.isHolder(BASE, address(vault)));
        assertTrue(ap.isHolder(BASE, v2));
    }

    // ─────────────────────────── tracking ───────────────────────────

    function test_tracksTransfersAcrossThreeChains() public {
        _seed();
        PortfolioAutopilot.Portfolio memory p = ap.portfolio();
        assertEq(p.priceE18, 2000e18, "price from Base pool Sync");
        assertEq(p.ethUnits, 5e18);
        assertEq(p.usdUnits, 6000e18);
        assertEq(p.totalUsd, 16_000e18);
        assertEq(p.ethShareBps, 6250);
        assertEq(p.chainValueUsd[0], 4000e18);
        assertEq(p.chainValueUsd[1], 10_000e18);
        assertEq(p.chainValueUsd[2], 2000e18);
        assertEq(sys.queueLength(), 0, "inside the band: no rebalance");
    }

    function test_outgoingTransferReducesHolding() public {
        _seed();
        vm.prank(wallet);
        usd[2].transfer(friend, 500e18);
        _pump();
        assertEq(ap.balanceOf(UNI, address(usd[2]), wallet), 1500e18);
        assertEq(ap.portfolio().usdUnits, 5500e18);
    }

    function test_ignoresUntrackedTokensAndHolders() public {
        _seed();
        DemoToken other = new DemoToken("Other", "OTH", 0);
        _onChain(address(other), SEP);
        other.mint(wallet, 1e30);
        eth[0].mint(stranger, 50e18);
        _pump();
        assertEq(ap.portfolio().ethUnits, 5e18);
    }

    function test_duplicateDeliveryIsIdempotent() public {
        duplicateDelivery = true;
        _seed();
        vm.prank(wallet);
        eth[0].transfer(friend, 1e18);
        _pump();
        assertEq(ap.balanceOf(SEP, address(eth[0]), wallet), 1e18);
        assertEq(ap.portfolio().ethUnits, 4e18);
    }

    function test_checkpointSetsTruthAndFixesDrift() public {
        // Tokens that arrived before tracking began are invisible to Transfer tracking…
        vm.pauseGasMetering();
        eth[2].mint(wallet, 7e18);
        vm.getRecordedLogs(); // pretend these happened before the reactive contract existed
        vm.resumeGasMetering();
        assertEq(ap.portfolio().ethUnits, 0);
        // …until the beacon publishes the real balance.
        beacons[2].checkpoint();
        _pump();
        assertEq(ap.balanceOf(UNI, address(eth[2]), wallet), 7e18);
    }

    function test_checkpointFromImpostorIgnored() public {
        BalanceBeacon fake =
            new BalanceBeacon(IPayable(payable(proxyOf[SEP])), address(ap), new address[](0), new address[](0));
        _onChain(address(fake), SEP);
        // impostor is not subscribed, and even if delivered it is filtered by address
        IReactive.LogRecord memory rec;
        rec.chainId = SEP;
        rec.contractAddress = address(fake);
        rec.topic0 = uint256(keccak256("Checkpoint(address,address,uint256)"));
        rec.topic1 = uint256(uint160(wallet));
        rec.topic2 = uint256(uint160(address(eth[0])));
        rec.data = abi.encode(uint256(1e24));
        rec.opCode = 3;
        _react(rec);
        assertEq(ap.portfolio().ethUnits, 0);
    }

    // ─────────────────────────── rebalancing loop ───────────────────────────

    function test_crossChainDriftTriggersSellOnBase() public {
        _seed();
        // Wallet receives 3 tETH on *Ethereum Sepolia* → ETH share 72.7% → above 65%.
        eth[0].mint(wallet, 3e18);
        _pump();

        assertEq(ap.nonce(), 1, "one rebalance requested");
        assertEq(ap.pendingNonce(), 0, "vault answered, pending cleared");
        assertEq(vault.rebalanceCount(), 1, "vault on Base traded");
        assertEq(callbacksFailed, 0);
        (uint256 vEth,) = vault.holdings();
        assertLt(vEth, 3e18, "vault sold tETH");

        PortfolioAutopilot.Portfolio memory p = ap.portfolio();
        assertGe(p.ethShareBps, 5500);
        assertLe(p.ethShareBps, 6500, "back inside the band");
        assertEq(vEth, ap.balanceOf(BASE, address(eth[1]), address(vault)), "books match chain");
    }

    function test_crossChainDriftTriggersBuyOnBase() public {
        _seed();
        // Wallet receives 6,000 tUSD on Unichain → ETH share 45.5% → below 55%.
        usd[2].mint(wallet, 6000e18);
        _pump();
        assertEq(vault.rebalanceCount(), 1);
        PortfolioAutopilot.Portfolio memory p = ap.portfolio();
        assertGe(p.ethShareBps, 5500, "bought back into the band");
    }

    function test_priceMoveTriggersRebalance() public {
        _seed(); // 62.5% at $2,000
        _nudgePrice(1, true, 300_000e18); // pump tETH price on Base ~ +30%
        _pump();
        assertGe(vault.rebalanceCount(), 1, "price-driven drift rebalanced");
        assertLe(ap.portfolio().ethShareBps, 6500);
    }

    function test_noSecondRequestWhilePendingThenTimeoutRetry() public {
        _seed();
        vault.setSettings(60, 10_000, true); // vault paused → it will answer "skipped"
        eth[0].mint(wallet, 3e18);
        _pump();
        assertEq(ap.nonce(), 1);
        assertEq(ap.pendingNonce(), 0, "skip also clears pending");
        assertEq(vault.rebalanceCount(), 0);

        // Simulate a lost callback: request goes out but nothing comes back.
        vault.setSettings(60, 10_000, false);
        vm.warp(block.timestamp + 10);
        eth[0].mint(wallet, 1e17);
        vm.getRecordedLogs();
        // route only the transfer, then drop the queued callback
        IReactive.LogRecord memory rec = _transferRecord(SEP, address(eth[0]), address(0), wallet, 1e17);
        _react(rec);
        assertEq(ap.nonce(), 2);
        sys.takeQueue();
        assertEq(ap.pendingNonce(), 2);

        // While pending, new events don't spawn duplicate requests.
        _react(_transferRecord(SEP, address(eth[0]), address(0), wallet, 1));
        assertEq(ap.nonce(), 2);

        // After the timeout the cron retries (first tick is the daily snapshot, then re-syncs, then the retry).
        vm.warp(block.timestamp + 901);
        _ticks(5);
        assertEq(ap.nonce(), 3);
        assertEq(vault.rebalanceCount(), 1);
    }

    function test_cooldownBetweenRebalances() public {
        _seed();
        eth[0].mint(wallet, 3e18);
        _pump();
        assertEq(ap.nonce(), 1);
        eth[0].mint(wallet, 5e18); // drift again immediately
        _pump();
        assertEq(ap.nonce(), 1, "cooldown holds the second request");
        vm.warp(block.timestamp + 121);
        _ticks(5);
        assertEq(ap.nonce(), 2, "cron retries after cooldown");
    }

    function test_pausedAutopilotStillTracksButDoesNotAct() public {
        _seed();
        ap.setPaused(true);
        eth[0].mint(wallet, 30e18);
        _pump();
        assertEq(ap.nonce(), 0);
        assertEq(ap.portfolio().ethUnits, 35e18);
    }

    function test_emptyVaultMakesNoRequests() public {
        eth[0].mint(wallet, 2e18); // wallet only — the vault was never funded
        basePool.sync();
        _pump();
        eth[0].mint(wallet, 10e18); // 100% ETH, but there is nothing the vault could trade
        _pump();
        _ticks(5);
        assertEq(ap.nonce(), 0, "no pointless requests");
    }

    function test_drainingVaultEthTriggersBuy() public {
        _seed();
        vm.prank(address(vault));
        eth[1].transfer(friend, 3e18); // ETH share falls to 40%
        _pump();
        assertEq(vault.rebalanceCount(), 1, "vault buys tETH back");
        assertGe(ap.portfolio().ethShareBps, 5500);
    }

    // ─────────────────────────── alerts ───────────────────────────

    function test_rangeAlertsOnExitAndReentry() public {
        _seed();
        ap.setRange(1800e18, 2200e18);
        _nudgePrice(2, false, 1e18); // tiny move: first reading, in range → no alert
        _pump();
        assertEq(journal.alertCount(), 0);
        assertEq(ap.rangeState(), 1);

        _nudgePrice(2, false, 120e18); // price falls ~20% on Unichain
        _pump();
        assertEq(journal.alertCount(), 1);
        Journal.Alert[] memory a = journal.latestAlerts(1);
        assertEq(a[0].kind, 2, "fell below range");
        assertLt(a[0].priceE18, 1800e18);

        _nudgePrice(2, true, 180_000e18); // back up to ~$1,930
        _pump();
        assertEq(journal.alertCount(), 2);
        assertEq(journal.latestAlerts(1)[0].kind, 1, "back in range");
    }

    // ─────────────────────────── cron: snapshots & self-healing ───────────────────────────

    function test_cronWritesDailySnapshotAndResyncs() public {
        _seed();
        _cron();
        _pump();
        assertEq(journal.snapshotCount(), 1);
        Journal.Snapshot[] memory s = journal.latestSnapshots(5);
        assertEq(s.length, 1);
        assertEq(s[0].totalUsd, 16_000e18);
        assertEq(s[0].ethShareBps, 6250);
        assertEq(s[0].targetBps, 6000);
        assertEq(s[0].chainValueUsd[1], 10_000e18);

        // The next three ticks re-sync one beacon each (spread out to respect the gas cap).
        for (uint256 i; i < 3; ++i) {
            _cron();
            _pump();
        }
        assertEq(ap.resyncCursor(), 0, "all beacons re-synced");

        // Cron ticks inside the interval don't write again…
        vm.warp(block.timestamp + 6 hours);
        _cron();
        _pump();
        assertEq(journal.snapshotCount(), 1);
        // …but the next day does.
        vm.warp(block.timestamp + 18 hours);
        _cron();
        _pump();
        assertEq(journal.snapshotCount(), 2);
    }

    function test_resyncHealsMissedEvents() public {
        _seed();
        // A transfer the reactive contract never saw (e.g. dropped while it was out of funds)
        vm.prank(wallet);
        usd[2].transfer(friend, 1000e18);
        vm.getRecordedLogs(); // dropped
        assertEq(ap.balanceOf(UNI, address(usd[2]), wallet), 2000e18, "books are stale");

        ap.snapshotNow(); // snapshot + resync callbacks to all three beacons
        _pump();
        assertEq(ap.balanceOf(UNI, address(usd[2]), wallet), 1000e18, "beacon re-sync fixed it");
    }

    // ─────────────────────────── security ───────────────────────────

    function test_reactOnlyFromSystem() public {
        IReactive.LogRecord memory rec;
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, stranger, SYSTEM_ADDR));
        ap.react(rec);
    }

    function test_vaultRejectsDirectCalls() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, stranger, proxyOf[BASE]));
        vault.rebalance(address(ap), 1, true, 1e18, 0);
    }

    function test_vaultRejectsOtherReactiveContracts() public {
        vm.prank(proxyOf[BASE]);
        vm.expectRevert(abi.encodeWithSelector(AbstractCallback.CallbackNotAuthorized.selector, stranger, address(ap)));
        vault.rebalance(stranger, 1, true, 1e18, 0);
    }

    function test_journalAndBeaconRejectStrangers() public {
        Journal.Snapshot memory s;
        vm.prank(stranger);
        vm.expectRevert();
        journal.recordSnapshot(address(ap), s);

        vm.prank(proxyOf[SEP]);
        vm.expectRevert(abi.encodeWithSelector(AbstractCallback.CallbackNotAuthorized.selector, stranger, address(ap)));
        beacons[0].resync(stranger);
    }

    function test_ownerOnlyControls() public {
        vm.startPrank(stranger);
        vm.expectRevert(PortfolioAutopilot.NotOwner.selector);
        ap.setPaused(true);
        vm.expectRevert(PortfolioAutopilot.NotOwner.selector);
        ap.setVault(stranger);
        vm.expectRevert(PortfolioAutopilot.NotOwner.selector);
        ap.setRange(1, 2);
        vm.expectRevert(PortfolioAutopilot.NotOwner.selector);
        ap.withdraw(payable(stranger), 0);
        vm.stopPrank();
    }

    function test_badRulesRejected() public {
        PortfolioAutopilot.Rules memory r = PortfolioAutopilot.Rules(6000, 0, 200, 120, 900, 10e18);
        vm.expectRevert(PortfolioAutopilot.BadRules.selector);
        ap.setRules(r);
        vm.expectRevert(PortfolioAutopilot.BadRules.selector);
        ap.setRange(2000e18, 1000e18);
    }

    // ─────────────────────────── vault rails ───────────────────────────

    function test_vaultSkipsOnSlippageAndCooldown() public {
        eth[1].mint(address(vault), 3e18);
        vm.prank(proxyOf[BASE]);
        vault.rebalance(address(ap), 7, true, 1e18, 10_000e18); // impossible minOut
        assertEq(vault.rebalanceCount(), 0);

        vm.prank(proxyOf[BASE]);
        vault.rebalance(address(ap), 8, true, 1e18, 0);
        assertEq(vault.rebalanceCount(), 1);

        vm.prank(proxyOf[BASE]);
        vault.rebalance(address(ap), 9, true, 1e18, 0); // inside 60s cooldown (timestamp-based)
        assertEq(vault.rebalanceCount(), 1);

        vm.warp(block.timestamp + 61);
        vm.prank(proxyOf[BASE]);
        vault.rebalance(address(ap), 10, true, 1e18, 0);
        assertEq(vault.rebalanceCount(), 2);
    }

    function test_vaultCapsTradeSize() public {
        eth[1].mint(address(vault), 10e18);
        vault.setSettings(60, 2500, false); // max 25% of balance per trade
        vm.prank(proxyOf[BASE]);
        vault.rebalance(address(ap), 1, true, 8e18, 0);
        (uint256 vEth,) = vault.holdings();
        assertEq(vEth, 7.5e18);
    }

    // ─────────────────────────── fuzz: the books always match the chains ───────────────────────────

    function testFuzz_booksMatchChains(uint256 seed) public {
        _seed();
        ap.setPaused(true); // pure accounting
        for (uint256 i; i < 12; ++i) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 c = seed % 3;
            bool isEth = (seed >> 8) % 2 == 0;
            DemoToken t = isEth ? eth[c] : usd[c];
            uint256 amt = (seed >> 16) % 1000e18;
            if ((seed >> 128) % 2 == 0) {
                t.mint(wallet, amt);
            } else {
                uint256 bal = t.balanceOf(wallet);
                vm.prank(wallet);
                t.transfer(friend, bal == 0 ? 0 : amt % (bal + 1));
            }
        }
        _pump();
        for (uint256 c; c < 3; ++c) {
            assertEq(ap.balanceOf(ids[c], address(eth[c]), wallet), eth[c].balanceOf(wallet));
            assertEq(ap.balanceOf(ids[c], address(usd[c]), wallet), usd[c].balanceOf(wallet));
        }
    }

    function test_reactGasStaysUnderCap() public {
        _seed();
        eth[0].mint(wallet, 3e18);
        _pump();
        _cron();
        _pump();
        emit log_named_uint("max react() gas", maxReactGas);
        assertLt(maxReactGas, REACT_GAS_CAP);
    }

    // ─────────────────────────── helpers ───────────────────────────

    function _ticks(uint256 k) internal {
        for (uint256 i; i < k; ++i) {
            _cron();
            _pump();
        }
    }

    function _transferRecord(uint256 chainId, address token, address from, address to, uint256 amt)
        internal
        returns (IReactive.LogRecord memory rec)
    {
        rec.chainId = chainId;
        rec.contractAddress = token;
        rec.topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef;
        rec.topic1 = uint256(uint160(from));
        rec.topic2 = uint256(uint160(to));
        rec.data = abi.encode(amt);
        rec.opCode = 3;
        rec.txHash = fakeTx;
        rec.logIndex = fakeTx++;
    }
}
