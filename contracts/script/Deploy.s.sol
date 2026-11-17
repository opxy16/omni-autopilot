// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Common} from "./Common.sol";
import {IPayable} from "reactive-lib/src/interfaces/IPayable.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {DemoPool} from "../src/DemoPool.sol";
import {IERC20Min} from "../src/interfaces/IERC20Min.sol";
import {BalanceBeacon} from "../src/BalanceBeacon.sol";
import {RebalancerVault} from "../src/RebalancerVault.sol";
import {Journal} from "../src/Journal.sol";
import {PortfolioAutopilot} from "../src/PortfolioAutopilot.sol";

/// Step 1 — run on Sepolia, Base Sepolia and Unichain Sepolia:
///   forge script script/Deploy.s.sol:DeployAssets --rpc-url <chain> --broadcast
/// Test tokens everywhere; a pool with liquidity on Base Sepolia (pricing) and Unichain Sepolia (LP range alert).
contract DeployAssets is Common {
    function run() external {
        uint256 pk = _pk();
        address me = vm.addr(pk);
        vm.startBroadcast(pk);
        DemoToken e = new DemoToken("Test ETH (Omni Autopilot)", "tETH", 1e18);
        DemoToken u = new DemoToken("Test USD (Omni Autopilot)", "tUSD", 1000e18);
        DemoPool pool;
        if (block.chainid == BASE_SEPOLIA || block.chainid == UNICHAIN_SEPOLIA) {
            pool = new DemoPool(IERC20Min(address(e)), IERC20Min(address(u)));
            e.mint(me, 1000e18);
            u.mint(me, 2_000_000e18);
            e.approve(address(pool), type(uint256).max);
            u.approve(address(pool), type(uint256).max);
            pool.addLiquidity(1000e18, 2_000_000e18); // 1 tETH = 2,000 tUSD
        }
        vm.stopBroadcast();
        _save(block.chainid, "ethToken", address(e));
        _save(block.chainid, "usdToken", address(u));
        if (address(pool) != address(0)) _save(block.chainid, "pool", address(pool));
        _save(block.chainid, "wallet", me);
    }
}

/// Step 2 — run on Lasna:
///   forge script script/Deploy.s.sol:DeployAutopilot --rpc-url lasna --broadcast
contract DeployAutopilot is Common {
    function run() external {
        uint256 pk = _pk();
        address me = vm.addr(pk);
        PortfolioAutopilot.Config memory c;
        c.wallet = vm.envOr("WATCHED_WALLET", me);
        c.chainIds = [SEPOLIA, BASE_SEPOLIA, UNICHAIN_SEPOLIA];
        for (uint256 i; i < 3; ++i) {
            c.ethTokens[i] = _addr(c.chainIds[i], "ethToken");
            c.usdTokens[i] = _addr(c.chainIds[i], "usdToken");
            require(c.ethTokens[i] != address(0) && c.usdTokens[i] != address(0), "run DeployAssets first");
        }
        c.vaultChainId = BASE_SEPOLIA;
        c.priceChainId = BASE_SEPOLIA;
        c.pricePool = _addr(BASE_SEPOLIA, "pool");
        c.priceEthIsToken0 = true; // DemoPool(tETH, tUSD)
        c.lpChainId = UNICHAIN_SEPOLIA;
        c.lpPool = _addr(UNICHAIN_SEPOLIA, "pool");
        c.lpEthIsToken0 = true;
        c.targetEthBps = 6000;
        c.bandBps = 500;

        vm.startBroadcast(pk);
        PortfolioAutopilot ap = new PortfolioAutopilot{value: vm.envOr("AUTOPILOT_FUNDING", uint256(2 ether))}(c);
        vm.stopBroadcast();
        _save(LASNA, "autopilot", address(ap));
        _save(LASNA, "wallet", c.wallet);
    }
}

/// Step 3 — run on each of the three testnets (needs the autopilot address from step 2):
///   forge script script/Deploy.s.sol:DeployCallbacks --rpc-url <chain> --broadcast
contract DeployCallbacks is Common {
    function run() external {
        uint256 pk = _pk();
        address ap = _addr(LASNA, "autopilot");
        require(ap != address(0), "run DeployAutopilot first");
        address wallet = _addr(LASNA, "wallet");
        uint256 chainId = block.chainid;
        IPayable proxy = IPayable(payable(_proxy(chainId)));
        address e = _addr(chainId, "ethToken");
        address u = _addr(chainId, "usdToken");
        uint256 fund = vm.envOr("CALLBACK_FUNDING", uint256(0.01 ether));

        vm.startBroadcast(pk);
        address vault;
        address journal;
        if (chainId == BASE_SEPOLIA) {
            vault = address(
                new RebalancerVault{value: fund}(
                    proxy, ap, IERC20Min(e), IERC20Min(u), DemoPool(_addr(chainId, "pool")), 60
                )
            );
            journal = address(new Journal{value: fund}(proxy, ap));
        }
        address[] memory toks = new address[](2);
        toks[0] = e;
        toks[1] = u;
        address[] memory holders = new address[](vault == address(0) ? 1 : 2);
        holders[0] = wallet;
        if (vault != address(0)) holders[1] = vault;
        BalanceBeacon b = new BalanceBeacon{value: fund}(proxy, ap, toks, holders);
        vm.stopBroadcast();

        // Save only after every deployment in this run succeeded.
        if (vault != address(0)) _save(chainId, "vault", vault);
        if (journal != address(0)) _save(chainId, "journal", journal);
        _save(chainId, "beacon", address(b));
    }
}

/// Step 4 — run on Lasna: wire the callback contracts into the autopilot.
///   forge script script/Deploy.s.sol:Configure --rpc-url lasna --broadcast
contract Configure is Common {
    function run() external {
        PortfolioAutopilot ap = PortfolioAutopilot(payable(_addr(LASNA, "autopilot")));
        vm.startBroadcast(_pk());
        ap.setVault(_addr(BASE_SEPOLIA, "vault"));
        ap.setJournal(_addr(BASE_SEPOLIA, "journal"));
        ap.setBeacon(SEPOLIA, _addr(SEPOLIA, "beacon"));
        ap.setBeacon(BASE_SEPOLIA, _addr(BASE_SEPOLIA, "beacon"));
        ap.setBeacon(UNICHAIN_SEPOLIA, _addr(UNICHAIN_SEPOLIA, "beacon"));
        ap.setRange(1800e18, 2200e18);
        ap.setSnapshotSchedule(uint32(vm.envOr("SNAPSHOT_INTERVAL", uint256(4 hours))), true);
        vm.stopBroadcast();
    }
}

/// Step 5 — run on each testnet: give the demo wallet and vault a starting book and publish a checkpoint.
///   Base: vault 3 tETH + 4,000 tUSD. Sepolia: wallet 2 tETH. Unichain: wallet 2,000 tUSD.
contract SeedBook is Common {
    function run() external {
        uint256 pk = _pk();
        uint256 chainId = block.chainid;
        DemoToken e = DemoToken(_addr(chainId, "ethToken"));
        DemoToken u = DemoToken(_addr(chainId, "usdToken"));
        address wallet = _addr(LASNA, "wallet");
        vm.startBroadcast(pk);
        if (chainId == BASE_SEPOLIA) {
            address vault = _addr(chainId, "vault");
            e.mint(vault, 3e18);
            u.mint(vault, 4000e18);
        } else if (chainId == SEPOLIA) {
            e.mint(wallet, 2e18);
        } else if (chainId == UNICHAIN_SEPOLIA) {
            u.mint(wallet, 2000e18);
        }
        BalanceBeacon(payable(_addr(chainId, "beacon"))).checkpoint();
        address pool = _addr(chainId, "pool");
        if (pool != address(0)) DemoPool(pool).sync(); // publish the starting price to the autopilot
        vm.stopBroadcast();
    }
}
