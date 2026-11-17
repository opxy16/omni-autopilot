// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";

/// @notice Shared constants and deployment-file helpers for all scripts.
abstract contract Common is Script {
    uint256 internal constant SEPOLIA = 11155111;
    uint256 internal constant BASE_SEPOLIA = 84532;
    uint256 internal constant UNICHAIN_SEPOLIA = 1301;
    uint256 internal constant LASNA = 5318007;

    // Callback proxies (dev.reactive.network/origins-and-destinations)
    address internal constant PROXY_SEPOLIA = 0xAa14d9Cd0f788Ca23d11805986C1d8bd035D23b4;
    address internal constant PROXY_BASE_SEPOLIA = 0x476F44b11F5C942c58f4c8E3d0300E5710743585;
    address internal constant PROXY_UNICHAIN_SEPOLIA = 0x775c9B990ADe401060B78D0e98684eEf8d2466C1;

    function _pk() internal view returns (uint256) {
        return vm.envUint("PRIVATE_KEY");
    }

    function _proxy(uint256 chainId) internal pure returns (address) {
        if (chainId == SEPOLIA) return PROXY_SEPOLIA;
        if (chainId == BASE_SEPOLIA) return PROXY_BASE_SEPOLIA;
        if (chainId == UNICHAIN_SEPOLIA) return PROXY_UNICHAIN_SEPOLIA;
        revert("no proxy for chain");
    }

    function _path(uint256 chainId) internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/deployments/", vm.toString(chainId), ".json");
    }

    function _addr(uint256 chainId, string memory key) internal view returns (address) {
        string memory json = vm.readFile(_path(chainId));
        string memory k = string.concat(".", key);
        if (!vm.keyExistsJson(json, k)) return address(0);
        return vm.parseJsonAddress(json, k);
    }

    /// @dev Rewrites the chain's deployment file with the given extra key added/replaced.
    function _save(uint256 chainId, string memory key, address value) internal {
        string memory obj = string.concat("dep", vm.toString(chainId));
        string memory path = _path(chainId);
        string[8] memory keys = ["ethToken", "usdToken", "pool", "autopilot", "vault", "journal", "beacon", "wallet"];
        string memory json;
        bool existing = vm.exists(path);
        string memory old = existing ? vm.readFile(path) : "";
        for (uint256 i; i < keys.length; ++i) {
            if (keccak256(bytes(keys[i])) == keccak256(bytes(key))) continue;
            if (existing && vm.keyExistsJson(old, string.concat(".", keys[i]))) {
                json = vm.serializeAddress(obj, keys[i], vm.parseJsonAddress(old, string.concat(".", keys[i])));
            }
        }
        json = vm.serializeAddress(obj, key, value);
        vm.writeJson(json, path);
    }
}
