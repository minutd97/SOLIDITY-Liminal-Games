// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
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
import {PoolId, PoolIdLibrary}    from "@uniswap/v4-core/src/types/PoolId.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IV4Hook {
  function latestSqrtPriceX96(PoolId poolId) external view returns (uint160);
}

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

/// @title V4PoolHelper – Uniswap V4 Liquidity Management Utility
contract V4PoolHelper is IERC721Receiver, Ownable, AccessControl {
    using CurrencyLibrary for Currency;

    bytes32 public constant POOL_CREATOR = keccak256("POOL_CREATOR"); // Role identifier for pool creators

    IPoolManager public immutable poolManager; // Uniswap V4 PoolManager contract
    IPositionManager public immutable positionManager; // Uniswap V4 PositionManager contract
    IAllowanceTransfer public immutable permit2; // Permit2 contract for token approvals
    address public immutable hookAddress; // Address of the deployed hook contract

    PoolKey public poolKey; // Stored PoolKey after pool creation
    uint256 private constant Q96 = 2**96; // Constant used in price and liquidity calculations
    int24 public standardTickLower; // Stored lower tick of the standard range
    int24 public standardTickUpper; // Stored upper tick of the standard range
    
    event PoolCreatedAndPositionMinted(
        address indexed token0,
        address indexed token1,
        int24    tickLower,
        int24    tickUpper,
        uint128  liquidity,
        uint256  amount0,
        uint256  amount1
    );
    event PositionFeesCollected(address indexed token0, address indexed token1, uint256 indexed tokenId);
    event LiquidityIncreasedFromContract(uint256 tokenId, uint256 token0Added, uint256 token1Added);

    /// @notice Initializes the helper with references to PoolManager, PositionManager, Permit2, and Hook
    constructor(address _poolManager, address _positionManager, address _permit2, address _hookAddress) Ownable(msg.sender) {
        require(_poolManager != address(0), "Invalid pool manager address");
        require(_positionManager != address(0), "Invalid position manager address");
        require(_permit2 != address(0), "Invalid permit2 address");
        require(_hookAddress != address(0), "Invalid hook address");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        poolManager = IPoolManager(_poolManager);
        positionManager = IPositionManager(_positionManager);
        permit2 = IAllowanceTransfer(_permit2);
        hookAddress = _hookAddress;
    }

    /// @notice Creates a new pool and mints a position with initial liquidity
    function createPoolAndAddLiquidity(PoolInput calldata _input, uint256 _centerETH, int24 _rangeSize) external payable onlyRole(POOL_CREATOR) {
        (int24 tickLower, int24 tickUpper, uint160 sqrtPriceX96) = calculateTicks(_input, _centerETH, _rangeSize);
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

        Currency currency0 = CurrencyLibrary.fromId(uint160(input.token0));
        Currency currency1 = CurrencyLibrary.fromId(uint160(input.token1));

        poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: input.fee,
            tickSpacing: input.tickSpacing,
            hooks: IHooks(hookAddress)
        });

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(input.tickLower),
            TickMath.getSqrtPriceAtTick(input.tickUpper),
            input.amount0,
            input.amount1
        );

        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory mintParams = buildMintParams(poolKey, input, liquidity);
        bytes[] memory params = buildPositionParams(poolKey, actions, mintParams, sqrtPriceX96);

        positionManager.multicall{value: msg.value}(params);
        emit PoolCreatedAndPositionMinted(
            input.token0,
            input.token1,
            tickLower,
            tickUpper,
            liquidity,
            input.amount0,
            input.amount1
        );
    }

    /// @notice Adds liquidity to an existing position using msg.value as ETH input and refunds any leftover.
    /// @dev LIM is pulled from the owner; ETH is forwarded based on internal computation. Excess ETH is refunded.
    function increaseLiquidityFromContract(address token0, address token1, uint256 amount0, uint256 amount1, uint256 tokenId) external payable onlyOwner {
        // Pull required LIM from owner
        IERC20(token1).transferFrom(msg.sender, address(this), amount1);

        // Build liquidity params
        (bytes memory actions, bytes[] memory params) = buildIncreaseLiquidityParamsForUser(
            token0,
            token1,
            amount0,
            amount1,
            tokenId
        );

        bytes memory inner = abi.encode(actions, params);
        uint256 deadline = block.timestamp + 120;

        // Execute the add liquidity call
        positionManager.modifyLiquidities{value: amount0}(inner, deadline);

        // Refund any excess ETH back to owner
        uint256 remaining = address(this).balance;
        if (remaining > 0) {
            (bool success, ) = payable(msg.sender).call{value: remaining}("");
            require(success, "Refund failed");
        }
        emit LiquidityIncreasedFromContract(tokenId, amount0, amount1);
    }

    /// @notice Collects all fees from a given Uniswap V4 position and sends them to the owner.
    function collectPositionFees(address token0, address token1, uint256 tokenId) external onlyOwner {
        // Reuse existing helper to construct calldata
        (bytes memory actions, bytes[] memory params) = buildCollectFeesParamsForUser(token0, token1, tokenId);

        // Wrap into final call for PositionManager
        bytes memory inner = abi.encode(actions, params);
        uint256 deadline = block.timestamp + 120;

        // Execute modifyLiquidities to collect fees
        positionManager.modifyLiquidities(inner, deadline);
        emit PositionFeesCollected(token0, token1, tokenId);
    }

    /// @notice Calculates tickLower, tickUpper and initial sqrtPriceX96 based on input amounts
    function calculateTicks(PoolInput memory input, uint256 centerETH, int24 rangeSize) internal pure returns (int24 tickLower, int24 tickUpper, uint160 sqrtPriceX96) {
        int24 tickSpacing = input.tickSpacing;

        sqrtPriceX96 = getSqrtPriceX96FromAmounts(centerETH, input.amount1);

        int24 centerTick = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        centerTick = (centerTick / tickSpacing) * tickSpacing;

        int24 halfRange = rangeSize / 2;

        tickLower = centerTick - halfRange;
        tickUpper = centerTick + halfRange;

        tickLower = (tickLower / tickSpacing) * tickSpacing;
        tickUpper = (tickUpper / tickSpacing) * tickSpacing;

        require(tickLower < tickUpper, "Invalid ticks calculated");
    }

    /// @notice Builds the full params array for a new pool initialization and position mint
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

    /// @notice Builds mint position parameters for pool creation
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

    /// @notice Builds mint position parameters for a user adding a new LP position
    function buildMintParamsForUser(PoolInput calldata input) external view returns (bytes memory actions, bytes[] memory params) {
        require(standardTickLower < standardTickUpper, "Pool not initialized");

        uint160 sqrtPriceX96 = IV4Hook(hookAddress).latestSqrtPriceX96(poolKey.toId());
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(standardTickLower),
            TickMath.getSqrtPriceAtTick(standardTickUpper),
            input.amount0,
            input.amount1
        );
        require(liquidity > 0, "No liquidity");

        actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION),
            uint8(Actions.SETTLE_PAIR)
        );

        params = new bytes[](2);
        params[0] = abi.encode(
            poolKey,
            standardTickLower,
            standardTickUpper,
            liquidity,
            type(uint128).max,
            type(uint128).max,
            msg.sender,
            abi.encode(
                poolKey.currency0,
                poolKey.currency1,
                true,
                false
            )
        );

        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);
    }

    /// @notice Builds parameters for increasing liquidity in an existing LP position
    function buildIncreaseLiquidityParamsForUser(address token0, address token1, uint256 amount0Desired, uint256 amount1Desired, uint256 tokenId) public view returns (bytes memory actions, bytes[] memory params) {
        require(standardTickLower < standardTickUpper, "Pool not initialized");
        require(amount0Desired > 0 && amount1Desired > 0, "Amounts must be > 0");

        uint128 liquidityDelta = LiquidityAmounts.getLiquidityForAmounts(
            IV4Hook(hookAddress).latestSqrtPriceX96(poolKey.toId()),
            TickMath.getSqrtPriceAtTick(standardTickLower),
            TickMath.getSqrtPriceAtTick(standardTickUpper),
            amount0Desired,
            amount1Desired
        );
        require(liquidityDelta > 0, "No additional liquidity");

        actions = abi.encodePacked(
            uint8(Actions.INCREASE_LIQUIDITY),
            uint8(Actions.SETTLE_PAIR)
        );

        params = new bytes[](2);
        params[0] = abi.encode(
            tokenId,
            liquidityDelta,
            uint128(amount0Desired + 1),
            uint128(amount1Desired + 1),
            abi.encode(
                CurrencyLibrary.fromId(uint160(token0)),
                CurrencyLibrary.fromId(uint160(token1)),
                token0 == address(0),
                token1 == address(0)
            )
        );
        params[1] = abi.encode(
            CurrencyLibrary.fromId(uint160(token0)),
            CurrencyLibrary.fromId(uint160(token1))
        );
    }

    /// @notice Builds parameters to decrease liquidity from a user’s position
    function buildDecreaseLiquidityParamsForUser(address token0, address token1, uint128 liquidityDelta, uint128 amount0Min, uint128 amount1Min, uint256 tokenId) external view returns (bytes memory actions, bytes[] memory params) {
        actions = abi.encodePacked(
            uint8(Actions.DECREASE_LIQUIDITY),
            uint8(Actions.TAKE_PAIR)
        );

        params = new bytes[](2);
        params[0] = abi.encode(
            tokenId,
            liquidityDelta,
            amount0Min,
            amount1Min,
            abi.encode(
                CurrencyLibrary.fromId(uint160(token0)),
                CurrencyLibrary.fromId(uint160(token1)),
                token0 == address(0),
                token1 == address(0)
            )
        );

        params[1] = abi.encode(
            CurrencyLibrary.fromId(uint160(token0)),
            CurrencyLibrary.fromId(uint160(token1)),
            msg.sender
        );
    }

    /// @notice Builds calldata to collect all fees from a user’s position
    function buildCollectFeesParamsForUser(address token0, address token1, uint256 tokenId) public view returns (bytes memory actions, bytes[] memory params) {
        actions = abi.encodePacked(
            uint8(Actions.DECREASE_LIQUIDITY),
            uint8(Actions.TAKE_PAIR)
        );

        params = new bytes[](2);
        params[0] = abi.encode(
            tokenId,
            uint128(0),
            uint128(0),
            uint128(0),
            abi.encode(
                CurrencyLibrary.fromId(uint160(token0)),
                CurrencyLibrary.fromId(uint160(token1)),
                token0 == address(0),
                token1 == address(0)
            )
        );

        params[1] = abi.encode(
            CurrencyLibrary.fromId(uint160(token0)),
            CurrencyLibrary.fromId(uint160(token1)),
            msg.sender
        );
    }

    /// @notice Builds parameters to burn a position NFT and withdraw all tokens
    function buildBurnPositionParamsForUser(address token0, address token1, uint128 amount0Min, uint128 amount1Min, uint256 tokenId) external view returns (bytes memory actions, bytes[] memory params) {
        Currency currency0 = Currency.wrap(token0);
        Currency currency1 = Currency.wrap(token1);

        actions = abi.encodePacked(
            uint8(Actions.BURN_POSITION),
            uint8(Actions.TAKE_PAIR)
        );

        params = new bytes[](2);
        params[0] = abi.encode(
            tokenId,
            amount0Min,
            amount1Min,
            abi.encode(
                currency0,
                currency1,
                token0 == address(0),
                token1 == address(0)
            )
        );

        params[1] = abi.encode(currency0, currency1, msg.sender);
    }

    /// @notice Returns token amounts receivable from a given liquidity delta
    function previewAmountsForLiquidity(uint128 liquidityDelta) external view returns (uint256 amount0, uint256 amount1) {
        require(standardTickLower < standardTickUpper, "Pool not initialized");

        uint160 sqrtP = IV4Hook(hookAddress).latestSqrtPriceX96(poolKey.toId());
        uint160 sqrtA = TickMath.getSqrtPriceAtTick(standardTickLower);
        uint160 sqrtB = TickMath.getSqrtPriceAtTick(standardTickUpper);

        (amount0, amount1) = _getAmountsForLiquidity(
            liquidityDelta,
            sqrtA,
            sqrtB,
            sqrtP
        );
    }

    /// @notice Returns both token amounts for an exact input of either token0 or token1
    function getAmountsForExact(uint256 exact0, uint256 exact1) public view returns (uint256 amount0, uint256 amount1) {
        require(standardTickLower < standardTickUpper, "Pool not initialized");
        require((exact0 == 0) != (exact1 == 0), "Specify exactly one exact amount");

        uint160 sqrtP = IV4Hook(hookAddress).latestSqrtPriceX96(poolKey.toId());
        uint160 sqrtA = TickMath.getSqrtPriceAtTick(standardTickLower);
        uint160 sqrtB = TickMath.getSqrtPriceAtTick(standardTickUpper);

        // Get the ratio based on 1 ETH worth of liquidity
        uint128 baseLiq = LiquidityAmounts.getLiquidityForAmount0(sqrtA, sqrtB, 1 ether);
        (uint256 baseETH, uint256 baseLIM) = _getAmountsForLiquidity(baseLiq, sqrtA, sqrtB, sqrtP);

        if (exact0 > 0) {
            // Drive from ETH input
            uint256 scale = FullMath.mulDiv(exact0, 1e18, baseETH); // scale = exact0 / baseETH (fixed-point)
            amount0 = exact0;
            amount1 = FullMath.mulDiv(baseLIM, scale, 1e18);
        } else {
            // Drive from LIM input
            uint256 scale = FullMath.mulDiv(exact1, 1e18, baseLIM); // scale = exact1 / baseLIM
            amount1 = exact1;
            amount0 = FullMath.mulDiv(baseETH, scale, 1e18);
        }
    }

    /// @notice Calculates the optimal token0 and token1 amounts that can be used for liquidity,
    ///         based on the user's maximum available balances and the pool's tick range.
    ///         This function ensures the returned amounts match the pool's required ETH:LIM ratio
    ///         and fit within both user-supplied balances.
    function getBestAmountsForUserBalance(uint256 max0, uint256 max1) public view returns (uint256 amount0, uint256 amount1) {
        require(standardTickLower < standardTickUpper, "Pool not initialized");

        uint160 sqrtP = IV4Hook(hookAddress).latestSqrtPriceX96(poolKey.toId());
        uint160 sqrtA = TickMath.getSqrtPriceAtTick(standardTickLower);
        uint160 sqrtB = TickMath.getSqrtPriceAtTick(standardTickUpper);

        // Use 1 ETH as base unit to get ETH:LIM ratio
        uint128 unitLiq = LiquidityAmounts.getLiquidityForAmount0(sqrtA, sqrtB, 1 ether);
        (uint256 baseETH, uint256 baseLIM) = _getAmountsForLiquidity(unitLiq, sqrtA, sqrtB, sqrtP);

        // Scale the ratio to fit within both user balances
        uint256 scaleETH = (baseETH > 0) ? (max0 * 1e18 / baseETH) : type(uint256).max;
        uint256 scaleLIM = (baseLIM > 0) ? (max1 * 1e18 / baseLIM) : type(uint256).max;
        uint256 scale = scaleETH < scaleLIM ? scaleETH : scaleLIM;

        amount0 = (baseETH * scale) / 1e18;
        amount1 = (baseLIM * scale) / 1e18;
    }

    /// @notice Internal helper to compute token0 and token1 amounts from liquidity
    function _getAmountsForLiquidity(uint128 liquidity, uint160 sqrtRatioAX96, uint160 sqrtRatioBX96, uint160 sqrtPriceX96) internal pure returns (uint256 amount0, uint256 amount1) {
        if (sqrtRatioAX96 > sqrtRatioBX96) (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);

        if (sqrtPriceX96 <= sqrtRatioAX96) {
            amount0 = FullMath.mulDiv(
                uint256(liquidity) << 96,
                uint256(sqrtRatioBX96 - sqrtRatioAX96),
                uint256(sqrtRatioAX96) * sqrtRatioBX96
            );
        } else if (sqrtPriceX96 < sqrtRatioBX96) {
            amount0 = FullMath.mulDiv(
                uint256(liquidity) << 96,
                uint256(sqrtRatioBX96 - sqrtPriceX96),
                uint256(sqrtPriceX96) * sqrtRatioBX96
            );
            amount1 = FullMath.mulDiv(
                liquidity,
                sqrtPriceX96 - sqrtRatioAX96,
                Q96
            );
        } else {
            amount1 = FullMath.mulDiv(
                liquidity,
                sqrtRatioBX96 - sqrtRatioAX96,
                Q96
            );
        }
    }

    /// @notice Computes sqrtPriceX96 from token0 and token1 amounts
    function getSqrtPriceX96FromAmounts(uint256 token0Amount, uint256 token1Amount) public pure returns (uint160) {
        require(token0Amount > 0 && token1Amount > 0, "Amounts must be > 0");

        uint256 ratioX192 = FullMath.mulDiv(token1Amount, 2**192, token0Amount);
        uint256 sqrtRatioX96 = sqrtUint(ratioX192);

        return uint160(sqrtRatioX96);
    }

    /// @notice Integer square root function for large uint256 values
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

    /// @notice Sets max token approvals in Permit2 for both tokens used in the pool
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

    /// @notice Grants POOL_CREATOR role to an address
    function grantCreatorRole(address account) public onlyOwner {
        grantRole(POOL_CREATOR, account);
    }

    /// @notice Revokes POOL_CREATOR role from an address
    function revokeCreatorRole(address account) public onlyOwner {
        revokeRole(POOL_CREATOR, account);
    }

    /// @notice Required override for receiving ERC721 tokens from PositionManager
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
