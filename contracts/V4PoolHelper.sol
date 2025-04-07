// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

contract V4PoolHelper is Ownable {
    using CurrencyLibrary for Currency;

    IPoolManager public immutable poolManager;

    constructor(address _poolManager) Ownable(msg.sender) {
        poolManager = IPoolManager(_poolManager);
    }

    struct PoolParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickSpacing;
        uint160 sqrtPriceX96;
        int24 tickLower;
        int24 tickUpper;
        address recipient;
    }

    function initializeAndAddLiquidity(PoolParams calldata input) external {
        (address sorted0, address sorted1) = input.token0 < input.token1
            ? (input.token0, input.token1)
            : (input.token1, input.token0);

        Currency currency0 = CurrencyLibrary.fromId(uint160(sorted0));
        Currency currency1 = CurrencyLibrary.fromId(uint160(sorted1));

        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: input.fee,
            tickSpacing: input.tickSpacing,
            hooks: IHooks(address(0))
        });

        // 1. Initialize the pool
        poolManager.initialize(key, input.sqrtPriceX96);

        // 2. Estimate liquidity from current balances
        uint256 amount0 = IERC20(sorted0).balanceOf(address(this));
        uint256 amount1 = IERC20(sorted1).balanceOf(address(this));

        uint160 sqrtRatioAX96 = TickMath.getSqrtPriceAtTick(input.tickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtPriceAtTick(input.tickUpper);

        if (sqrtRatioAX96 > sqrtRatioBX96) {
            (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);
        }

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            input.sqrtPriceX96,
            sqrtRatioAX96,
            sqrtRatioBX96,
            amount0,
            amount1
        );

        // 3. Approve token transfers to the poolManager
        IERC20(sorted0).transfer(address(poolManager), amount0);
        IERC20(sorted1).transfer(address(poolManager), amount1);

        // 4. Call unlock via a delegate contract that executes add liquidity logic (not shown here)
        // In production, this contract should implement IUnlockCallback and settle deltas properly
        revert("Add liquidity logic needs to be implemented via unlockCallback.");
    }

    function transferTokensIn(address token0, address token1) external onlyOwner {
        IERC20(token0).transferFrom(msg.sender, address(this), IERC20(token0).balanceOf(msg.sender));
        IERC20(token1).transferFrom(msg.sender, address(this), IERC20(token1).balanceOf(msg.sender));
    }
}
