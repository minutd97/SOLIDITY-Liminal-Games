// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

contract V4Hook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using StateLibrary  for IPoolManager;

    /// @notice latest cached sqrtPriceX96 for each pool
    mapping(PoolId => uint160) public latestSqrtPriceX96;

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize:false,
            afterInitialize:true,
            beforeAddLiquidity:false,
            afterAddLiquidity:true,
            beforeRemoveLiquidity:false,
            afterRemoveLiquidity:true,
            beforeSwap:false,
            afterSwap:true,
            beforeDonate:false,
            afterDonate:false,
            beforeSwapReturnDelta:false,
            afterSwapReturnDelta:false,
            afterAddLiquidityReturnDelta:false,
            afterRemoveLiquidityReturnDelta:false
        });
    }

    function _afterInitialize(
        address,               // sender
        PoolKey calldata key,  // the pool just initialized
        uint160 sqrtPriceX96,  // initial price
        int24   /*tick*/       // initial tick
    ) internal override returns (bytes4) {
        latestSqrtPriceX96[key.toId()] = sqrtPriceX96;
        return BaseHook.afterInitialize.selector;
    }

    function _afterAddLiquidity(
        address,                                      // sender
        PoolKey calldata key,                         // which pool
        IPoolManager.ModifyLiquidityParams calldata,  // mint/increase params
        BalanceDelta /*liquidityDelta*/,              // returned change
        BalanceDelta /*feesAccrued*/,                 // returned fees
        bytes calldata                                // hookData
    ) internal override returns (bytes4, BalanceDelta) {
        // read on‐chain price from transient storage
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
        latestSqrtPriceX96[key.toId()] = sqrtPriceX96;
        // return no adjustment to original delta
        return (BaseHook.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }

    function _afterRemoveLiquidity(
        address,                                      // sender
        PoolKey calldata key,                         // which pool
        IPoolManager.ModifyLiquidityParams calldata,  // decrease params
        BalanceDelta /*liquidityDelta*/,              // returned change
        BalanceDelta /*feesAccrued*/,                 // returned fees
        bytes calldata                                // hookData
    ) internal override returns (bytes4, BalanceDelta) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
        latestSqrtPriceX96[key.toId()] = sqrtPriceX96;
        return (BaseHook.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }

    function _afterSwap(
        address,                        // sender
        PoolKey calldata key,           // which pool
        IPoolManager.SwapParams calldata, // swap params
        BalanceDelta /*delta*/,         // returned deltas
        bytes calldata                  // hookData
    ) internal override returns (bytes4, int128) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
        latestSqrtPriceX96[key.toId()] = sqrtPriceX96;
        // no custom adjustment to swap delta
        return (BaseHook.afterSwap.selector, 0);
    }
}
