// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test, Vm} from "forge-std/Test.sol";
import {IReactive} from "reactive-lib/src/interfaces/IReactive.sol";
import {ISystemContract} from "reactive-lib/src/interfaces/ISystemContract.sol";

/// @notice Stand-in for Reactive's system contract (0x8888…8888). Records subscriptions and
///         callback requests so the harness can play the role of the network.
contract MockSystem {
    uint256 internal constant REACTIVE_IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;

    struct Sub {
        address subscriber;
        uint256 chainId;
        address contractAddr;
        uint256[4] topics;
        bool active;
    }

    struct Request {
        address sender;
        uint256 chainId;
        address recipient;
        uint64 gasLimit;
        bytes payload;
    }

    Sub[] public subs;
    Request[] internal _queue;

    receive() external payable {}

    function debt(address) external pure returns (uint256) {
        return 0;
    }

    function subscribe(uint256 chainId, address c, uint256 t0, uint256 t1, uint256 t2, uint256 t3) external {
        subs.push(Sub(msg.sender, chainId, c, [t0, t1, t2, t3], true));
    }

    function unsubscribe(uint256 chainId, address c, uint256 t0, uint256 t1, uint256 t2, uint256 t3) external {
        for (uint256 i; i < subs.length; ++i) {
            Sub storage s = subs[i];
            if (
                s.active && s.subscriber == msg.sender && s.chainId == chainId && s.contractAddr == c
                    && s.topics[0] == t0 && s.topics[1] == t1 && s.topics[2] == t2 && s.topics[3] == t3
            ) {
                s.active = false;
                return;
            }
        }
    }

    function requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0 memory c) external {
        _queue.push(Request(msg.sender, c.chainId, c.recipient, c.gasLimit, c.payload));
    }

    function subCount() external view returns (uint256) {
        return subs.length;
    }

    function activeSubCount(address subscriber) external view returns (uint256 n) {
        for (uint256 i; i < subs.length; ++i) {
            if (subs[i].active && subs[i].subscriber == subscriber) n++;
        }
    }

    /// @notice How many subscriptions of `subscriber` match this log.
    function matches(address subscriber, uint256 chainId, address emitter, uint256[4] memory topics, uint256 nTopics)
        external
        view
        returns (uint256 n)
    {
        for (uint256 i; i < subs.length; ++i) {
            Sub storage s = subs[i];
            if (!s.active || s.subscriber != subscriber) continue;
            if (s.chainId != 0 && s.chainId != chainId) continue;
            if (s.contractAddr != address(0) && s.contractAddr != emitter) continue;
            bool ok = true;
            for (uint256 k; k < 4; ++k) {
                if (s.topics[k] == REACTIVE_IGNORE) continue;
                if (k >= nTopics || s.topics[k] != topics[k]) {
                    ok = false;
                    break;
                }
            }
            if (ok) n++;
        }
    }

    function takeQueue() external returns (Request[] memory q) {
        q = _queue;
        delete _queue;
    }

    function queueLength() external view returns (uint256) {
        return _queue.length;
    }
}

/// @notice Plays Reactive Network inside one Foundry EVM: origin-chain logs are routed to `react()`
///         (once per matching subscription, like the real network), and callback requests are
///         delivered through a per-chain proxy with the reactive contract's address injected.
abstract contract OmniHarness is Test {
    address internal constant SYSTEM_ADDR = 0x8888888888888888888888888888888888888888;
    address internal constant CRON_SOURCE = 0x0000000000000000000000000000000000fffFfF;
    uint256 internal constant CRON1000_TOPIC0 = 0xe20b31294d84c3661ddc8f423abb9c70310d0cf172aa2714ead78029b325e3f4;
    uint256 internal constant REACT_GAS_CAP = 900_000;
    /// @dev The proxy keeps some gas for its own accounting; model that conservatively.
    uint256 internal constant PROXY_OVERHEAD = 150_000;

    MockSystem internal sys;
    IReactive internal rc; // reactive contract under test

    mapping(address => uint256) internal chainOf; // emitter => pretend chain id
    mapping(uint256 => address) internal proxyOf; // chain id => callback proxy

    uint256 internal fakeTx = 1;
    uint256 internal reactCalls;
    uint256 internal maxReactGas;
    uint256 internal callbacksDelivered;
    uint256 internal callbacksFailed;
    bool internal duplicateDelivery; // deliver every matching log twice to test idempotence

    function _installSystem() internal {
        MockSystem impl = new MockSystem();
        vm.etch(SYSTEM_ADDR, address(impl).code);
        sys = MockSystem(payable(SYSTEM_ADDR));
    }

    function _onChain(address emitter, uint256 chainId) internal {
        chainOf[emitter] = chainId;
    }

    /// @notice Route all recorded logs and queued callbacks until the system is quiet.
    function _pump() internal {
        for (uint256 round; round < 20; ++round) {
            Vm.Log[] memory logs = vm.getRecordedLogs();
            bool any;
            for (uint256 i; i < logs.length; ++i) {
                if (chainOf[logs[i].emitter] == 0) continue;
                any = true;
                _route(logs[i]);
            }
            if (sys.queueLength() > 0) {
                any = true;
                _deliver();
            }
            if (!any) return;
        }
        revert("pump did not settle");
    }

    function _route(Vm.Log memory l) internal {
        uint256[4] memory topics;
        for (uint256 k; k < l.topics.length && k < 4; ++k) {
            topics[k] = uint256(l.topics[k]);
        }
        uint256 n = sys.matches(address(rc), chainOf[l.emitter], l.emitter, topics, l.topics.length);
        if (n == 0) return;
        if (duplicateDelivery) n = n + 1;

        IReactive.LogRecord memory rec = IReactive.LogRecord({
            chainId: chainOf[l.emitter],
            contractAddress: l.emitter,
            topic0: topics[0],
            topic1: topics[1],
            topic2: topics[2],
            topic3: topics[3],
            data: l.data,
            blockNumber: block.number,
            opCode: l.topics.length,
            blockHash: 0,
            txHash: fakeTx,
            logIndex: fakeTx
        });
        fakeTx++;
        for (uint256 i; i < n; ++i) {
            _react(rec);
        }
    }

    function _react(IReactive.LogRecord memory rec) internal {
        vm.prank(SYSTEM_ADDR);
        uint256 g = gasleft();
        rc.react(rec);
        uint256 used = g - gasleft();
        if (used > maxReactGas) maxReactGas = used;
        reactCalls++;
        assertLt(used, REACT_GAS_CAP, "react() exceeded Reactive's 900k gas cap");
    }

    function _cron() internal {
        IReactive.LogRecord memory rec;
        rec.chainId = block.chainid;
        rec.contractAddress = CRON_SOURCE;
        rec.topic0 = CRON1000_TOPIC0;
        rec.opCode = 1;
        rec.txHash = fakeTx++;
        _react(rec);
    }

    function _deliver() internal {
        MockSystem.Request[] memory q = sys.takeQueue();
        for (uint256 i; i < q.length; ++i) {
            MockSystem.Request memory r = q[i];
            assertGe(r.gasLimit, 100_000, "callbacks under 100k gas are ignored by Reactive");
            bytes memory payload = r.payload;
            address sender = r.sender;
            assembly {
                mstore(add(payload, 36), sender) // overwrite reserved first arg with the RVM address
            }
            vm.prank(proxyOf[r.chainId]);
            (bool ok,) = r.recipient.call{gas: r.gasLimit - PROXY_OVERHEAD}(payload);
            if (ok) callbacksDelivered++;
            else callbacksFailed++;
        }
    }
}
