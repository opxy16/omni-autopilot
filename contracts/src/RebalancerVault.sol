// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPayable} from "reactive-lib/src/interfaces/IPayable.sol";
import {AbstractCallback} from "reactive-lib/src/base/AbstractCallback.sol";
import {IERC20Min} from "./interfaces/IERC20Min.sol";
import {DemoPool} from "./DemoPool.sol";

/// @title RebalancerVault
/// @notice Holds the "managed" slice of the portfolio on Base Sepolia. When the reactive contract
///         sees that the *cross-chain* allocation has drifted outside its band, it calls `rebalance`
///         here and the vault swaps through the pool back toward the target mix.
///
///         Safety rails that live on this chain (so they hold even if the reactive side misbehaves):
///         - only the callback proxy, carrying our reactive contract's address, can call `rebalance`;
///         - a timestamp cooldown (Base Sepolia makes 200 ms blocks, so we never count blocks);
///         - a per-trade cap as a share of the vault's balance;
///         - a minimum-output check against the price the reactive contract expected.
///         It never reverts on a rule check: it emits `RebalanceSkipped` instead, so the reactive
///         contract always hears back and can clear its pending flag.
contract RebalancerVault is AbstractCallback {
    event Rebalanced(uint256 indexed nonce, bool sellEth, uint256 amountIn, uint256 amountOut, uint256 priceE18);
    event RebalanceSkipped(uint256 indexed nonce, uint8 reason);
    event SettingsUpdated(uint256 minInterval, uint16 maxTradeBps, bool paused);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    error NotOwner();

    uint8 public constant SKIP_PAUSED = 1;
    uint8 public constant SKIP_COOLDOWN = 2;
    uint8 public constant SKIP_EMPTY = 3;
    uint8 public constant SKIP_SLIPPAGE = 4;

    address public immutable owner;
    IERC20Min public immutable ethToken;
    IERC20Min public immutable usdToken;
    DemoPool public immutable pool;

    uint256 public minInterval;
    uint16 public maxTradeBps;
    bool public paused;
    uint256 public lastRebalanceAt;
    uint256 public rebalanceCount;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        IPayable callbackProxy_,
        address reactive_,
        IERC20Min ethToken_,
        IERC20Min usdToken_,
        DemoPool pool_,
        uint256 minInterval_
    ) payable AbstractCallback(callbackProxy_, reactive_) {
        owner = msg.sender;
        ethToken = ethToken_;
        usdToken = usdToken_;
        pool = pool_;
        minInterval = minInterval_;
        maxTradeBps = 10_000;
        ethToken_.approve(address(pool_), type(uint256).max);
        usdToken_.approve(address(pool_), type(uint256).max);
    }

    /// @notice Callback entry point.
    /// @param rvm      Reactive contract address, injected by Reactive Network (auth).
    /// @param nonce    Request id from the reactive contract; echoed in the result event.
    /// @param sellEth  true = sell tETH for tUSD, false = buy tETH with tUSD.
    /// @param amountIn Amount of the input token the reactive contract asked to trade.
    /// @param minOut   Least output acceptable for `amountIn` (scaled down if amountIn is capped).
    function rebalance(address rvm, uint256 nonce, bool sellEth, uint256 amountIn, uint256 minOut)
        external
        onlyServiceProvider
        onlyCallbackSender(rvm)
    {
        if (paused) return _skip(nonce, SKIP_PAUSED);
        if (lastRebalanceAt != 0 && block.timestamp < lastRebalanceAt + minInterval) {
            return _skip(nonce, SKIP_COOLDOWN);
        }

        IERC20Min tokenIn = sellEth ? ethToken : usdToken;
        uint256 cap = (tokenIn.balanceOf(address(this)) * maxTradeBps) / 10_000;
        if (amountIn > cap) {
            if (amountIn != 0) minOut = (minOut * cap) / amountIn;
            amountIn = cap;
        }
        if (amountIn == 0) return _skip(nonce, SKIP_EMPTY);

        uint256 expected = pool.quote(address(tokenIn), amountIn);
        if (expected < minOut) return _skip(nonce, SKIP_SLIPPAGE);

        lastRebalanceAt = block.timestamp;
        rebalanceCount += 1;
        uint256 out = pool.swap(address(tokenIn), amountIn, minOut, address(this));
        emit Rebalanced(nonce, sellEth, amountIn, out, pool.priceE18(address(ethToken)));
    }

    function holdings() external view returns (uint256 eth, uint256 usd) {
        return (ethToken.balanceOf(address(this)), usdToken.balanceOf(address(this)));
    }

    function setSettings(uint256 minInterval_, uint16 maxTradeBps_, bool paused_) external onlyOwner {
        require(maxTradeBps_ <= 10_000, "bps");
        minInterval = minInterval_;
        maxTradeBps = maxTradeBps_;
        paused = paused_;
        emit SettingsUpdated(minInterval_, maxTradeBps_, paused_);
    }

    function withdraw(IERC20Min token, address to, uint256 amount) external onlyOwner {
        require(token.transfer(to, amount), "transfer");
        emit Withdrawn(address(token), to, amount);
    }

    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "native");
    }

    function coverDebt() external {
        _coverDebt();
    }

    function _skip(uint256 nonce, uint8 reason) internal {
        emit RebalanceSkipped(nonce, reason);
    }
}
