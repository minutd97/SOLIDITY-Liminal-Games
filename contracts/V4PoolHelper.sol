// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPoolInitializer_v4} from "@uniswap/v4-periphery/src/interfaces/IPoolInitializer_v4.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "@uniswap/v4-periphery/lib/permit2/src/interfaces/IAllowanceTransfer.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";

/// @dev Only include this during Hardhat testing
import "hardhat/console.sol";

struct PoolInput {
    address token0;
    address token1;
    uint256 amount0;
    uint256 amount1;
    uint24 fee;
    int24 tickSpacing;
    int24 tickLower;
    int24 tickUpper;
}

struct MintContext {
    PoolKey pool;
    Currency currency0;
    Currency currency1;
    uint128 liquidity;
    uint256 valueToSend;
}

contract V4PoolHelper is Ownable, AccessControl {
    using CurrencyLibrary for Currency;

    bytes32 public constant POOL_CREATOR = keccak256("POOL_CREATOR");

    IPoolManager public immutable poolManager;
    IPositionManager public immutable positionManager;
    IAllowanceTransfer public immutable permit2;

    int24 public standardTickLower;
    int24 public standardTickUpper;
    mapping(address => uint256) public userTokenIds;

    constructor(address _poolManager, address _positionManager, address _permit2) Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        poolManager = IPoolManager(_poolManager);
        positionManager = IPositionManager(_positionManager);
        permit2 = IAllowanceTransfer(_permit2);
    }

    function createPoolAndAddLiquidity(PoolInput calldata _input) external payable onlyRole(POOL_CREATOR) {
        (int24 tickLower, int24 tickUpper, uint160 sqrtPriceX96) = calculateTicks(_input);
        standardTickLower = tickLower;
        standardTickUpper = tickUpper;

        PoolInput memory input = PoolInput({
            token0: _input.token0,
            token1: _input.token1,
            amount0: _input.amount0,
            amount1: _input.amount1,
            fee: _input.fee,
            tickSpacing: _input.tickSpacing,
            tickLower: tickLower,
            tickUpper: tickUpper
        });
        
        bool isCorrectOrder = input.token0 < input.token1;
        (address sorted0, address sorted1) = isCorrectOrder
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

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(input.tickLower),
            TickMath.getSqrtPriceAtTick(input.tickUpper),
            input.amount0,
            input.amount1
        );

        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory mintParams = buildMintParams(pool, input, liquidity);
        bytes[] memory params = buildPositionParams(pool, actions, mintParams, sqrtPriceX96);

        positionManager.multicall{value: msg.value}(params);
    }

    function calculateTicks(PoolInput memory input) internal pure returns (int24 tickLower, int24 tickUpper, uint160 sqrtPriceX96) {
        int24 tickSpacing = input.tickSpacing;

        sqrtPriceX96 = getSqrtPriceX96FromAmounts(input.amount0, input.amount1);

        int24 centerTick = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        centerTick = (centerTick / tickSpacing) * tickSpacing;

        int24 rangeSize = 40080;
        int24 halfRange = rangeSize / 2;

        tickLower = centerTick - halfRange;
        tickUpper = centerTick + halfRange;

        tickLower = (tickLower / tickSpacing) * tickSpacing;
        tickUpper = (tickUpper / tickSpacing) * tickSpacing;

        require(tickLower < tickUpper, "Invalid ticks calculated");
    }

    function buildMintParamsForUser(PoolInput calldata input) external view returns (bytes memory actions, bytes[] memory params, uint256 valueToSend) {
        // 1) Basic guards
        require(userTokenIds[msg.sender] == 0, "Already minted");
        require(standardTickLower < standardTickUpper, "Pool not init");

        // 2) Sort and wrap tokens
        (address t0, address t1) = input.token0 < input.token1
            ? (input.token0, input.token1)
            : (input.token1, input.token0);
        Currency c0 = CurrencyLibrary.fromId(uint160(t0));
        Currency c1 = CurrencyLibrary.fromId(uint160(t1));

        PoolKey memory pk = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: input.fee,
            tickSpacing: input.tickSpacing,
            hooks: IHooks(address(0))
        });

        // 3) Compute price and liquidity
        uint160 sqrtP = getSqrtPriceX96FromAmounts(input.amount0, input.amount1);
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            sqrtP,
            TickMath.getSqrtPriceAtTick(standardTickLower),
            TickMath.getSqrtPriceAtTick(standardTickUpper),
            input.amount0,
            input.amount1
        );
        require(liq > 0, "No liquidity");

        // 4) Invert to exact token pulls
        (uint256 amt0, uint256 amt1) = _getAmountsForLiquidity(
            sqrtP,
            TickMath.getSqrtPriceAtTick(standardTickLower),
            TickMath.getSqrtPriceAtTick(standardTickUpper),
            liq
        );

        // add 1 wei/token as slippage buffer
        amt0 += 1;
        amt1 += 1;

        // 5) Value to send (native ETH if t0 is zero‐address)
        valueToSend = (t0 == address(0)) ? amt0 : 0;

        // 6) Build actions bytes
        actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION),
            uint8(Actions.SETTLE_PAIR)
        );

        // 7) Build params array: [MINT_POSITION, SETTLE_PAIR]
        params = new bytes[](2);
        params[0] = abi.encode(
            pk,
            standardTickLower,
            standardTickUpper,
            liq,
            type(uint128).max,
            type(uint128).max,
            msg.sender,
            bytes("")    // hookData
        );
        params[1] = abi.encode(c0, c1);
    }

    // Helper to invert LiquidityAmounts.getLiquidityForAmounts
    function _getAmountsForLiquidity(
        uint160 sqrtPriceX96,
        uint160 sqrtA,
        uint160 sqrtB,
        uint128 liquidity
    ) internal pure returns (uint256 amount0, uint256 amount1) {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);

        // entirely below range → all token0
        if (sqrtPriceX96 <= sqrtA) {
            amount0 = FullMath.mulDiv(
                uint256(liquidity) << FixedPoint96.RESOLUTION,
                (sqrtB - sqrtA),
                uint256(sqrtA) * sqrtB
            );
        }
        // in‐range → both
        else if (sqrtPriceX96 < sqrtB) {
            amount0 = FullMath.mulDiv(
                uint256(liquidity) << FixedPoint96.RESOLUTION,
                (sqrtB - sqrtPriceX96),
                uint256(sqrtPriceX96) * sqrtB
            );
            amount1 = FullMath.mulDiv(
                liquidity,
                (sqrtPriceX96 - sqrtA),
                uint256(1) << FixedPoint96.RESOLUTION
            );
        }
        // entirely above range → all token1
        else {
            amount1 = FullMath.mulDiv(
                liquidity,
                (sqrtB - sqrtA),
                uint256(1) << FixedPoint96.RESOLUTION
            );
        }
    }

    function buildPositionParams(PoolKey memory pool, bytes memory actions, bytes[] memory mintParams, uint160 sqrtPriceX96) internal view returns (bytes[] memory) {
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encodeWithSelector(
            IPoolInitializer_v4.initializePool.selector,
            pool,
            sqrtPriceX96
        );
        params[1] = abi.encodeWithSelector(
            positionManager.modifyLiquidities.selector,
            abi.encode(actions, mintParams),
            block.timestamp + 120
        );
        return params;
    }

    function buildMintParams(PoolKey memory pool, PoolInput memory input, uint128 liquidity) internal view returns (bytes[] memory) {
        bytes[] memory mintParams = new bytes[](2);
        mintParams[0] = abi.encode(
            pool,
            input.tickLower,
            input.tickUpper,
            liquidity,
            input.amount0,
            input.amount1,
            msg.sender,
            bytes("")
        );
        mintParams[1] = abi.encode(pool.currency0, pool.currency1);
        return mintParams;
    }

    function setupPermit2Approvals(address token0, address token1) external onlyRole(POOL_CREATOR) {
        if (token0 != address(0)) {
            IERC20(token0).approve(address(permit2), type(uint256).max);
            permit2.approve(token0, address(positionManager), type(uint160).max, type(uint48).max);
        }

        if (token1 != address(0)) {
            IERC20(token1).approve(address(permit2), type(uint256).max);
            permit2.approve(token1, address(positionManager), type(uint160).max, type(uint48).max);
        }
    }

    function getSqrtPriceX96FromAmounts(uint256 token0Amount, uint256 token1Amount) public pure returns (uint160) {
        require(token0Amount > 0 && token1Amount > 0, "Amounts must be > 0");

        uint256 ratioX192 = FullMath.mulDiv(token1Amount, 2**192, token0Amount);
        uint256 sqrtRatioX96 = sqrtUint(ratioX192);

        return uint160(sqrtRatioX96);
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

    function grantCreatorRole(address account) public onlyOwner {
        grantRole(POOL_CREATOR, account);
    }

    function revokeCreatorRole(address account) public onlyOwner {
        revokeRole(POOL_CREATOR, account);
    }
}
