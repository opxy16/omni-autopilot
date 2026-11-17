// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPayable} from "reactive-lib/src/interfaces/IPayable.sol";
import {AbstractCallback} from "reactive-lib/src/base/AbstractCallback.sol";
import {IERC20Min} from "./interfaces/IERC20Min.sol";

/// @title BalanceBeacon
/// @notice Lives on each origin chain. Reads the *real* token balances of the tracked holders
///         and emits them as `Checkpoint` events. The reactive contract treats a checkpoint as the
///         absolute truth, so its cross-chain books can never drift from reality.
///         - `checkpoint()` is permissionless: it can only ever report true on-chain balances.
///         - `resync()` is the same thing, triggered by the reactive contract's daily cron callback.
contract BalanceBeacon is AbstractCallback {
    event Checkpoint(address indexed holder, address indexed token, uint256 balance);
    event TargetsUpdated(address[] tokens, address[] holders);

    error NotOwner();

    address public immutable owner;
    address[] internal _tokens;
    address[] internal _holders;

    constructor(IPayable callbackProxy_, address reactive_, address[] memory tokens_, address[] memory holders_)
        payable
        AbstractCallback(callbackProxy_, reactive_)
    {
        owner = msg.sender;
        _setTargets(tokens_, holders_);
    }

    function targets() external view returns (address[] memory tokens, address[] memory holders) {
        return (_tokens, _holders);
    }

    function setTargets(address[] calldata tokens_, address[] calldata holders_) external {
        if (msg.sender != owner) revert NotOwner();
        _setTargets(tokens_, holders_);
    }

    /// @notice Anyone may publish the current balances.
    function checkpoint() external {
        _emitAll();
    }

    /// @notice Callback from the reactive contract (cron-driven re-sync).
    /// @param rvm Reactive contract address, injected by the network.
    function resync(address rvm) external onlyServiceProvider onlyCallbackSender(rvm) {
        _emitAll();
    }

    /// @notice Lets anyone settle callback debt with ETH already held by this contract.
    function coverDebt() external {
        _coverDebt();
    }

    function _emitAll() internal {
        uint256 nt = _tokens.length;
        uint256 nh = _holders.length;
        for (uint256 h; h < nh; ++h) {
            for (uint256 t; t < nt; ++t) {
                emit Checkpoint(_holders[h], _tokens[t], IERC20Min(_tokens[t]).balanceOf(_holders[h]));
            }
        }
    }

    function _setTargets(address[] memory tokens_, address[] memory holders_) internal {
        _tokens = tokens_;
        _holders = holders_;
        emit TargetsUpdated(tokens_, holders_);
    }
}
