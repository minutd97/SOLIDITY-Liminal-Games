// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

contract V4PoolHelper is Ownable, IUnlockCallback {
    using CurrencyLibrary for Currency;

    IPoolManager public immutable poolManager;

    PoolKey private currentKey;
    int24 private tickLower;
    int24 private tickUpper;
    uint128 private liquidity;
    address private recipient;

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
        bool isCorrectOrder = input.token0 < input.token1;
        (address sorted0, address sorted1) = isCorrectOrder
            ? (input.token0, input.token1)
            : (input.token1, input.token0);

        console.log("Sorted Order:");
        console.log("Currency0 (should be lesser):", sorted0);
        console.log("Currency1:", sorted1);

        Currency currency0 = CurrencyLibrary.fromId(uint160(sorted0));
        Currency currency1 = CurrencyLibrary.fromId(uint160(sorted1));

        currentKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: input.fee,
            tickSpacing: input.tickSpacing,
            hooks: IHooks(address(0))
        });

        tickLower = input.tickLower;
        tickUpper = input.tickUpper;
        recipient = input.recipient;

        uint256 amount0 = IERC20(sorted0).balanceOf(address(this));
        uint256 amount1 = IERC20(sorted1).balanceOf(address(this));

        uint160 sqrtRatioAX96 = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtPriceAtTick(tickUpper);
        if (sqrtRatioAX96 > sqrtRatioBX96) {
            (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);
        }

        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            input.sqrtPriceX96,
            sqrtRatioAX96,
            sqrtRatioBX96,
            amount0,
            amount1
        );

        console.log("Calculated liquidity:", liquidity);
        console.log("Amount0 to transfer:", amount0);
        console.log("Amount1 to transfer:", amount1);

        poolManager.sync(currency0);
        poolManager.sync(currency1);

        IERC20(sorted0).transfer(address(poolManager), amount0);
        IERC20(sorted1).transfer(address(poolManager), amount1);

        console.log("Calling initialize on pool manager...");
        poolManager.initialize(currentKey, input.sqrtPriceX96);

        console.log("Calling unlock on pool manager...");
        poolManager.unlock(abi.encode("addLiquidity"));
    }

    function unlockCallback(bytes calldata) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager can call");

        console.log("Inside unlockCallback()");
        console.log("Liquidity to add:", liquidity);

        // ✅ Settle both currencies before using them
        poolManager.settleFor(address(this));

        (BalanceDelta delta, ) = poolManager.modifyLiquidity(
            currentKey,
            IPoolManager.ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(int128(liquidity)),
                salt: keccak256("lmnl-v4-helper")
            }),
            ""
        );

        console.log("modifyLiquidity executed inside unlockCallback()");
        return abi.encode(delta);
    }

    function transferTokensIn(address token0, address token1) external onlyOwner {
        IERC20(token0).transferFrom(msg.sender, address(this), IERC20(token0).balanceOf(msg.sender));
        IERC20(token1).transferFrom(msg.sender, address(this), IERC20(token1).balanceOf(msg.sender));
    }
}
