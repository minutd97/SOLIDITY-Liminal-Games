// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPoolInitializer_v4} from "@uniswap/v4-periphery/src/interfaces/IPoolInitializer_v4.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "@uniswap/v4-periphery/lib/permit2/src/interfaces/IAllowanceTransfer.sol";
import { LiquidityAmounts } from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract UniswapV4PoolCreator is Ownable {
    using CurrencyLibrary for Currency;

    IPoolManager public immutable poolManager;
    IPositionManager public immutable positionManager;
    IAllowanceTransfer public immutable permit2;

    constructor(
        address _poolManager,
        address _positionManager,
        address _permit2
    ) Ownable(msg.sender) {
        poolManager = IPoolManager(_poolManager);
        positionManager = IPositionManager(_positionManager);
        permit2 = IAllowanceTransfer(_permit2);
    }

    struct PoolInput {
        address token0;
        address token1;
        uint24 fee;
        int24 tickSpacing;
        uint160 sqrtPriceX96;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        address recipient;
    }

    function createPoolAndAddLiquidity(PoolInput calldata input) external payable {
        (address sorted0, address sorted1) = input.token0 < input.token1
            ? (input.token0, input.token1)
            : (input.token1, input.token0);

        Currency currency0 = CurrencyLibrary.fromId(uint160(sorted0));
        Currency currency1 = CurrencyLibrary.fromId(uint160(sorted1));

        PoolKey memory pool = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: input.fee,
            tickSpacing: input.tickSpacing,
            hooks: IHooks(address(0))
        });

        // // Convert ticks to sqrt ratios
        // uint160 sqrtRatioAX96 = TickMath.getSqrtPriceAtTick(input.tickLower);
        // uint160 sqrtRatioBX96 = TickMath.getSqrtPriceAtTick(input.tickUpper);

        // if (sqrtRatioAX96 > sqrtRatioBX96) {
        //     (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);
        // }

        // Estimate liquidity conservatively
        uint256 balance0 = IERC20(sorted0).balanceOf(address(this));
        uint256 balance1 = IERC20(sorted1).balanceOf(address(this));

        // uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
        //     input.sqrtPriceX96,
        //     sqrtRatioAX96,
        //     sqrtRatioBX96,
        //     balance0,
        //     balance1
        // );

        // console.log("Calculated liquidity:", liquidity);
        // console.log("Amount0:", balance0);
        // console.log("Amount1:", balance1);

        // Transfer tokens directly to PositionManager
        IERC20(sorted0).transfer(address(positionManager), balance0);
        IERC20(sorted1).transfer(address(positionManager), balance1);

        uint256 posManagerbalance0 = IERC20(sorted0).balanceOf(address(positionManager));
        uint256 posManagerbalance1 = IERC20(sorted1).balanceOf(address(positionManager));
        console.log("posManager Token0 balance:", posManagerbalance0);
        console.log("posManager Token1 balance:", posManagerbalance1);

        // Setup mint parameters with low minAmount0/1 to avoid revert
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));

        bytes[] memory mintParams = new bytes[](2);
        mintParams[0] = abi.encode(
            pool,
            input.tickLower,
            input.tickUpper,
            input.liquidity,
            0,
            0,
            msg.sender,
            bytes("")
        );
        mintParams[1] = abi.encode(pool.currency0, pool.currency1);

        bytes[] memory params = new bytes[](2);
        params[0] = abi.encodeWithSelector(
            IPoolInitializer_v4.initializePool.selector,
            pool,
            input.sqrtPriceX96
        );
        params[1] = abi.encodeWithSelector(
            positionManager.modifyLiquidities.selector,
            abi.encode(actions, mintParams),
            block.timestamp + 120
        );

        console.log("Price:", input.sqrtPriceX96);
        console.log("Currency0:", Currency.unwrap(pool.currency0));
        console.log("Currency1:", Currency.unwrap(pool.currency1));

        positionManager.multicall(params);
    }

    function setupPermit2Approvals(address token0, address token1) external onlyOwner {
        IERC20(token0).approve(address(permit2), type(uint256).max);
        IERC20(token1).approve(address(permit2), type(uint256).max);

        IAllowanceTransfer(address(permit2)).approve(token0, address(positionManager), type(uint160).max, type(uint48).max);
        IAllowanceTransfer(address(permit2)).approve(token1, address(positionManager), type(uint160).max, type(uint48).max);
    }

    function initializePoolOnly(PoolInput calldata input) external {
        (address sorted0, address sorted1) = input.token0 < input.token1
        ? (input.token0, input.token1)
        : (input.token1, input.token0);

        Currency currency0 = CurrencyLibrary.fromId(uint160(sorted0));
        Currency currency1 = CurrencyLibrary.fromId(uint160(sorted1));

        PoolKey memory pool = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: input.fee,
            tickSpacing: input.tickSpacing,
            hooks: IHooks(address(0))
        });

        poolManager.initialize(pool, input.sqrtPriceX96);
    }

    function getSqrtPriceX96(uint256 price, uint8 decimals0, uint8 decimals1) public pure returns (uint160) {
        // Normalize to 1e18 scale
        uint256 numerator = price * (10 ** decimals0) * 1e18;
        uint256 denominator = (10 ** decimals1);
        uint256 ratioX18 = numerator / denominator;

        uint256 sqrtPriceX96 = (sqrtUint(ratioX18) << 96) / 1e9; // shift then scale down
        return uint160(sqrtPriceX96);
    }

    function sqrtUint(uint256 x) internal pure returns (uint256 result) {
        if (x == 0) return 0;
        uint256 xx = x;
        result = 1;
        if (xx >= 0x100000000000000000000000000000000) {
            xx >>= 128;
            result <<= 64;
        }
        if (xx >= 0x10000000000000000) {
            xx >>= 64;
            result <<= 32;
        }
        if (xx >= 0x100000000) {
            xx >>= 32;
            result <<= 16;
        }
        if (xx >= 0x10000) {
            xx >>= 16;
            result <<= 8;
        }
        if (xx >= 0x100) {
            xx >>= 8;
            result <<= 4;
        }
        if (xx >= 0x10) {
            xx >>= 4;
            result <<= 2;
        }
        if (xx >= 0x8) {
            result <<= 1;
        }
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        result = (result + x / result) >> 1;
        uint256 r1 = x / result;
        return (result < r1 ? result : r1);
    }
}
