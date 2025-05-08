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

contract V4PoolHelper is Ownable, AccessControl {
    using CurrencyLibrary for Currency;

    bytes32 public constant POOL_CREATOR = keccak256("POOL_CREATOR");

    IPoolManager public immutable poolManager;
    IPositionManager public immutable positionManager;
    IAllowanceTransfer public immutable permit2;
    address public immutable hookAddress;

    uint256 private constant Q96 = 2**96;
    uint160 public poolSqrtPriceX96;
    int24 public standardTickLower;
    int24 public standardTickUpper;

    mapping(address => uint256) public userTokenIds;

    constructor(address _poolManager, address _positionManager, address _permit2, address _hookAddress) Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        poolManager = IPoolManager(_poolManager);
        positionManager = IPositionManager(_positionManager);
        permit2 = IAllowanceTransfer(_permit2);
        hookAddress = _hookAddress;
    }

    function createPoolAndAddLiquidity(PoolInput calldata _input) external payable onlyRole(POOL_CREATOR) {
        (int24 tickLower, int24 tickUpper, uint160 sqrtPriceX96) = calculateTicks(_input);
        poolSqrtPriceX96 = sqrtPriceX96;
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

        PoolKey memory pool = PoolKey({
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

    function buildMintParamsForUser(PoolInput calldata input) external view returns (bytes memory actions, bytes[] memory params) {
        require(userTokenIds[msg.sender] == 0, "Already minted");
        require(standardTickLower < standardTickUpper, "Pool not initialized");

        // No sorting needed, we trust ETH is always token0
        address token0 = input.token0;
        address token1 = input.token1;

        PoolKey memory poolKey = PoolKey({
            currency0: CurrencyLibrary.fromId(uint160(token0)),
            currency1: CurrencyLibrary.fromId(uint160(token1)),
            fee: input.fee,
            tickSpacing: input.tickSpacing,
            hooks: IHooks(hookAddress)
        });

        uint160 sqrtPriceX96 = getSqrtPriceX96FromAmounts(input.amount0, input.amount1);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(standardTickLower),
            TickMath.getSqrtPriceAtTick(standardTickUpper),
            input.amount0,
            input.amount1
        );
        require(liquidity > 0, "No liquidity");

        // Build actions
        actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION),
            uint8(Actions.SETTLE_PAIR)
        );

        // Build params
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
                token0 == address(0),
                token1 == address(0)
            )
        );

        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);
    }

    function buildIncreaseLiquidityParamsForUser(address token0, address token1, uint256 amount0Desired, uint256 amount1Desired) external view returns (bytes memory actions, bytes[] memory params) {
        uint256 tokenId = userTokenIds[msg.sender];
        require(tokenId != 0, "Not minted yet");
        require(standardTickLower < standardTickUpper, "Pool not initialized");
        require(amount0Desired > 0 && amount1Desired > 0, "Amounts must be > 0");

        // 1) Compute how much liquidity that amount buys at current price
        uint128 liquidityDelta = LiquidityAmounts.getLiquidityForAmounts(
            poolSqrtPriceX96,
            TickMath.getSqrtPriceAtTick(standardTickLower),
            TickMath.getSqrtPriceAtTick(standardTickUpper),
            amount0Desired,
            amount1Desired
        );
        require(liquidityDelta > 0, "No additional liquidity");

        // 2) Build the action bytes
        actions = abi.encodePacked(
            uint8(Actions.INCREASE_LIQUIDITY),
            uint8(Actions.SETTLE_PAIR)
        );

        // 3) Inline everything into the params array
        params = new bytes[](2);
        params[0] = abi.encode(
            tokenId,
            liquidityDelta,
            // max amounts = desired + 1 (buffer)
            uint128(amount0Desired + 1),
            uint128(amount1Desired + 1),
            // hookData inline
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

    /// @notice  Build decrease-liquidity action & params for the caller’s single position
    function buildDecreaseLiquidityParamsForUser(
        address token0,
        address token1,
        uint128 liquidityDelta,
        uint128 amount0Min,
        uint128 amount1Min
    ) external view returns (bytes memory actions, bytes[] memory params) {
        // 1) Ensure the user has a position
        uint256 tokenId = userTokenIds[msg.sender];
        require(tokenId != 0, "Not minted yet");

        // 2) Encode the actions: DECREASE_LIQUIDITY + TAKE_PAIR
        actions = abi.encodePacked(
            uint8(Actions.DECREASE_LIQUIDITY),
            uint8(Actions.TAKE_PAIR)
        );

        // 3) Prepare params array
        params = new bytes[](2);

        // 3a) Action 0: decrease liquidity
        params[0] = abi.encode(
            tokenId,
            liquidityDelta,
            // minimum token amounts to receive
            amount0Min,
            amount1Min,
            // inline hookData for settlement (token IDs & native flags)
            abi.encode(
                CurrencyLibrary.fromId(uint160(token0)),
                CurrencyLibrary.fromId(uint160(token1)),
                token0 == address(0),
                token1 == address(0)
            )
        );

        // 3b) Action 1: take pair (same hookData as above, no extra args)
        params[1] = abi.encode(
            CurrencyLibrary.fromId(uint160(token0)),
            CurrencyLibrary.fromId(uint160(token1)),
            msg.sender
        );
    }

    /// @notice Build calldata to collect all fees for the user’s position
    function buildCollectFeesParamsForUser(address token0, address token1) external view returns (bytes memory actions, bytes[] memory params) {
        uint256 tokenId = userTokenIds[msg.sender];
        require(tokenId != 0, "No position");

        // 1) DECREASE_LIQUIDITY with zero delta
        // 2) TAKE_PAIR to collect everything
        actions = abi.encodePacked(
            uint8(Actions.DECREASE_LIQUIDITY),
            uint8(Actions.TAKE_PAIR)
        );

        params = new bytes[](2);

        // DECREASE_LIQUIDITY(tokenId, 0, 0, 0, hookData)
        params[0] = abi.encode(
        tokenId,
        uint128(0),
        uint128(0),
        uint128(0),
        // same hookData as in mint/increase
        abi.encode(
            CurrencyLibrary.fromId(uint160(token0)),
            CurrencyLibrary.fromId(uint160(token1)),
            token0 == address(0),
            token1 == address(0)
        )
        );

        // TAKE_PAIR(currency0, currency1, recipient)
        params[1] = abi.encode(
        CurrencyLibrary.fromId(uint160(token0)),
        CurrencyLibrary.fromId(uint160(token1)),
        msg.sender
        );
    }

    function buildBurnPositionParamsForUser(
        address token0,
        address token1,
        uint128 amount0Min,
        uint128 amount1Min
    ) external view returns (bytes memory actions, bytes[] memory params) {
        uint256 tokenId = userTokenIds[msg.sender];
        require(tokenId != 0, "No position to burn");

        // Wrap the raw token addresses into Uniswap Currency objects
        Currency currency0 = Currency.wrap(token0);
        Currency currency1 = Currency.wrap(token1);

        // 1) BURN_POSITION → 2) TAKE_PAIR
        actions = abi.encodePacked(
            uint8(Actions.BURN_POSITION),
            uint8(Actions.TAKE_PAIR)
        );

        params = new bytes[](2);

        // 1) Burn the position (this withdraws the funds into the PositionManager)
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

        // 2) Take the withdrawn funds out of the PositionManager to the user
        params[1] = abi.encode(currency0, currency1, msg.sender);
    }

    /// @notice  Preview token amounts for a given liquidity decrease using internal helper
    function previewAmountsForLiquidity(uint128 liquidityDelta)external view returns (uint256 amount0, uint256 amount1) {
        // 1) Ensure the position exists and pool is initialized
        uint256 tokenId = userTokenIds[msg.sender];
        require(tokenId != 0, "Position not minted yet");
        require(standardTickLower < standardTickUpper, "Pool not initialized");

        // 2) Load current price and tick boundaries
        uint160 sqrtP = poolSqrtPriceX96;
        uint160 sqrtA = TickMath.getSqrtPriceAtTick(standardTickLower);
        uint160 sqrtB = TickMath.getSqrtPriceAtTick(standardTickUpper);

        // 3) Delegate to your internal helper
        (amount0, amount1) = _getAmountsForLiquidity(
            liquidityDelta,
            sqrtA,
            sqrtB,
            sqrtP
        );
    }

    /// @notice Given exactly one of amount0 or amount1, returns the matching pair for that exact input.
    /// @param exact0   If >0, compute how much token1 is needed for this exact amount0; otherwise must be 0.
    /// @param exact1   If >0, compute how much token0 is needed for this exact amount1; otherwise must be 0.
    /// @return amount0 The actual amount0 you must supply (equals exact0 if you drove on exact0, or computed if drove on exact1)
    /// @return amount1 The actual amount1 you must supply (equals exact1 if you drove on exact1, or computed if drove on exact0)
    function getAmountsForExact(uint256 exact0, uint256 exact1) external view returns (uint256 amount0, uint256 amount1) {
        require(standardTickLower < standardTickUpper, "Pool not initialized");
        require((exact0 == 0) != (exact1 == 0), "Specify exactly one exact amount");

        uint160 sqrtP = poolSqrtPriceX96;
        uint160 sqrtA = TickMath.getSqrtPriceAtTick(standardTickLower);
        uint160 sqrtB = TickMath.getSqrtPriceAtTick(standardTickUpper);

        // derive liquidity from whichever exact side is set
        uint128 liquidity;
        if (exact0 > 0) {
            // exact0 = ETH side
            liquidity = LiquidityAmounts.getLiquidityForAmount0(
                sqrtA,
                sqrtB,
                exact0
            );
        } else {
            // exact1 = LIM side
            liquidity = LiquidityAmounts.getLiquidityForAmount1(
                sqrtA,
                sqrtB,
                exact1
            );
        }

        // now convert that liquidity back into the two token amounts
        (amount0, amount1) = _getAmountsForLiquidity(
            liquidity,
            sqrtA,
            sqrtB,
            sqrtP
        );
    }

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

    function storeTokenId(uint256 tokenId) external {
        require(userTokenIds[msg.sender] == 0, "Already stored");
        userTokenIds[msg.sender] = tokenId;
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
