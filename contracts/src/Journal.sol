// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPayable} from "reactive-lib/src/interfaces/IPayable.sol";
import {AbstractCallback} from "reactive-lib/src/base/AbstractCallback.sol";

/// @title Journal
/// @notice The autopilot's diary on Base Sepolia. The reactive contract writes a portfolio snapshot
///         here on a schedule (driven by Reactive's cron) and records price-range alerts.
///         The dashboard reads its history straight from this contract.
contract Journal is AbstractCallback {
    /// @dev Chain order of `chainValueUsd`: Ethereum Sepolia, Base Sepolia, Unichain Sepolia.
    struct Snapshot {
        uint64 timestamp; // Lasna time when the snapshot was taken
        uint64 lasnaBlock;
        uint256 totalUsd; // 1e18 = $1 (test dollars)
        uint256 ethUnits; // tETH held across all chains (1e18)
        uint256 usdUnits; // tUSD held across all chains (1e18)
        uint256 priceE18; // tETH price in tUSD
        uint16 ethShareBps;
        uint16 targetBps;
        uint256[3] chainValueUsd;
    }

    struct Alert {
        uint64 timestamp;
        uint8 kind; // 1 = back in range, 2 = fell below range, 3 = rose above range
        uint256 priceE18;
        uint256 lowerE18;
        uint256 upperE18;
    }

    event SnapshotRecorded(uint256 indexed id, uint256 totalUsd, uint16 ethShareBps, uint256 priceE18);
    event RangeAlert(uint256 indexed id, uint8 indexed kind, uint256 priceE18, uint256 lowerE18, uint256 upperE18);

    Snapshot[] internal _snapshots;
    Alert[] internal _alerts;

    constructor(IPayable callbackProxy_, address reactive_) payable AbstractCallback(callbackProxy_, reactive_) {}

    function recordSnapshot(address rvm, Snapshot calldata s) external onlyServiceProvider onlyCallbackSender(rvm) {
        _snapshots.push(s);
        emit SnapshotRecorded(_snapshots.length - 1, s.totalUsd, s.ethShareBps, s.priceE18);
    }

    function recordAlert(address rvm, Alert calldata a) external onlyServiceProvider onlyCallbackSender(rvm) {
        _alerts.push(a);
        emit RangeAlert(_alerts.length - 1, a.kind, a.priceE18, a.lowerE18, a.upperE18);
    }

    function snapshotCount() external view returns (uint256) {
        return _snapshots.length;
    }

    function alertCount() external view returns (uint256) {
        return _alerts.length;
    }

    /// @notice Most recent `limit` snapshots, oldest first.
    function latestSnapshots(uint256 limit) external view returns (Snapshot[] memory out) {
        uint256 n = _snapshots.length;
        if (limit > n) limit = n;
        out = new Snapshot[](limit);
        for (uint256 i; i < limit; ++i) {
            out[i] = _snapshots[n - limit + i];
        }
    }

    /// @notice Most recent `limit` alerts, oldest first.
    function latestAlerts(uint256 limit) external view returns (Alert[] memory out) {
        uint256 n = _alerts.length;
        if (limit > n) limit = n;
        out = new Alert[](limit);
        for (uint256 i; i < limit; ++i) {
            out[i] = _alerts[n - limit + i];
        }
    }

    function coverDebt() external {
        _coverDebt();
    }
}
