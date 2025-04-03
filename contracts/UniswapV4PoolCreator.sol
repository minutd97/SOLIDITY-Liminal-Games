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

        bytes[] memory params = new bytes[](1);

        // params[0] = abi.encodeWithSelector(
        //     IPoolInitializer_v4.initializePool.selector,
        //     pool,
        //     input.sqrtPriceX96
        // );

        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));

        bytes[] memory mintParams = new bytes[](2);
        mintParams[0] = abi.encode(
            pool, 
            input.tickLower, 
            input.tickUpper, 
            input.liquidity, 
            type(uint256).max, 
            type(uint256).max, 
            input.recipient, 
            bytes(""));

        mintParams[1] = abi.encode(pool.currency0, pool.currency1);

        uint256 deadline = block.timestamp + 60;
        params[0] = abi.encodeWithSelector(
            positionManager.modifyLiquidities.selector, abi.encode(actions, mintParams), deadline
        );

        console.log("Price:", input.sqrtPriceX96);
        console.log("liq:", input.liquidity);
        console.log("Currency0:", Currency.unwrap(pool.currency0));
        console.log("Currency1:", Currency.unwrap(pool.currency1));

        positionManager.multicall{value: msg.value}(params);
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

    function getSqrtPriceX96(uint256 priceToken1PerToken0, uint8 decimalsToken0, uint8 decimalsToken1) public pure returns (uint160) {
        uint256 adjustedPrice = priceToken1PerToken0 * (10 ** decimalsToken0) / (10 ** decimalsToken1);
        uint256 sqrt = sqrtUint(adjustedPrice);
        return uint160(sqrt << 96);
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
