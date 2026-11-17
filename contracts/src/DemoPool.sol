// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IERC20Min} from "./interfaces/IERC20Min.sol";

/// @title DemoPool
/// @notice A tiny x*y=k pool (0.3% fee) for the testnet demo. It emits the exact Uniswap V2
///         `Sync` and `Swap` events, so the reactive contract that prices from it works
///         unchanged against any real Uniswap V2-style pair.
contract DemoPool {
    /// @dev Same signature as UniswapV2Pair.Sync -> topic0 0x1c411e9a…bad1
    event Sync(uint112 reserve0, uint112 reserve1);
    /// @dev Same signature as UniswapV2Pair.Swap
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event LiquidityChanged(int256 amount0, int256 amount1);

    error NotOwner();
    error BadToken();
    error ZeroAmount();
    error Slippage(uint256 out, uint256 minOut);
    error Overflow();
    error TransferFailed();

    IERC20Min public immutable token0;
    IERC20Min public immutable token1;
    address public immutable owner;

    uint112 public reserve0;
    uint112 public reserve1;

    constructor(IERC20Min token0_, IERC20Min token1_) {
        token0 = token0_;
        token1 = token1_;
        owner = msg.sender;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, uint32(block.timestamp));
    }

    /// @notice Uniswap V2 output formula with a 0.3% fee.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256) {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) return 0;
        uint256 inWithFee = amountIn * 997;
        return (inWithFee * reserveOut) / (reserveIn * 1000 + inWithFee);
    }

    function quote(address tokenIn, uint256 amountIn) external view returns (uint256) {
        if (tokenIn == address(token0)) return getAmountOut(amountIn, reserve0, reserve1);
        if (tokenIn == address(token1)) return getAmountOut(amountIn, reserve1, reserve0);
        revert BadToken();
    }

    /// @notice Price of `base` in units of the other token, scaled by 1e18 (both tokens use 18 decimals).
    function priceE18(address base) external view returns (uint256) {
        if (base == address(token0)) return reserve0 == 0 ? 0 : (uint256(reserve1) * 1e18) / reserve0;
        if (base == address(token1)) return reserve1 == 0 ? 0 : (uint256(reserve0) * 1e18) / reserve1;
        revert BadToken();
    }

    /// @notice Re-emit `Sync` with the current reserves (same as UniswapV2Pair.sync()).
    ///         Lets a newly deployed reactive contract learn the price without waiting for a trade.
    function sync() external {
        emit Sync(reserve0, reserve1);
    }

    function addLiquidity(uint256 amount0, uint256 amount1) external {
        if (msg.sender != owner) revert NotOwner();
        _pull(token0, amount0);
        _pull(token1, amount1);
        _sync(uint256(reserve0) + amount0, uint256(reserve1) + amount1);
        emit LiquidityChanged(int256(amount0), int256(amount1));
    }

    function removeLiquidity(uint256 amount0, uint256 amount1, address to) external {
        if (msg.sender != owner) revert NotOwner();
        _push(token0, to, amount0);
        _push(token1, to, amount1);
        _sync(uint256(reserve0) - amount0, uint256(reserve1) - amount1);
        emit LiquidityChanged(-int256(amount0), -int256(amount1));
    }

    /// @notice Swap an exact `amountIn` of `tokenIn` for the other token, sent to `to`.
    function swap(address tokenIn, uint256 amountIn, uint256 minOut, address to) external returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        bool zeroForOne;
        if (tokenIn == address(token0)) zeroForOne = true;
        else if (tokenIn != address(token1)) revert BadToken();

        (uint256 rIn, uint256 rOut) =
            zeroForOne ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
        amountOut = getAmountOut(amountIn, rIn, rOut);
        if (amountOut == 0 || amountOut < minOut) revert Slippage(amountOut, minOut);

        if (zeroForOne) {
            _pull(token0, amountIn);
            _push(token1, to, amountOut);
            _sync(rIn + amountIn, rOut - amountOut);
            emit Swap(msg.sender, amountIn, 0, 0, amountOut, to);
        } else {
            _pull(token1, amountIn);
            _push(token0, to, amountOut);
            _sync(rOut - amountOut, rIn + amountIn);
            emit Swap(msg.sender, 0, amountIn, amountOut, 0, to);
        }
    }

    function _sync(uint256 r0, uint256 r1) internal {
        if (r0 > type(uint112).max || r1 > type(uint112).max) revert Overflow();
        reserve0 = uint112(r0);
        reserve1 = uint112(r1);
        emit Sync(reserve0, reserve1);
    }

    function _pull(IERC20Min token, uint256 amount) internal {
        if (amount == 0) return;
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
    }

    function _push(IERC20Min token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (!token.transfer(to, amount)) revert TransferFailed();
    }
}
