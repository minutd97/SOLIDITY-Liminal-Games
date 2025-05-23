// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IUniversalRouter } from "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import { Commands } from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IV4Router } from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import { Actions } from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import { IPermit2 } from "@uniswap/v4-periphery/lib/permit2/src/interfaces/IPermit2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { CurrencyLibrary, Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";

/// @title V4SwapHelper
/// @notice Facilitates single-token swaps using Uniswap V4 and the Universal Router. 
///         Primarily intended for backend-triggered or automated swaps initiated by the contract owner.
contract V4SwapHelper is Ownable, ReentrancyGuard {
    using CurrencyLibrary for Currency;

    IUniversalRouter public immutable router; // Uniswap Universal Router contract used for executing multicalls
    IPoolManager public immutable poolManager; // Uniswap V4 PoolManager used for identifying pool keys
    IPermit2 public immutable permit2; // Permit2 contract used for token approvals across contracts

    /// @notice Emitted after a successful swap, includes user address and amount received
    event SwapExecuted(address indexed user, uint256 amountOut);

    /// @notice Sets the router, poolManager, and permit2 addresses for interacting with Uniswap V4
    constructor(address _router, address _poolManager, address _permit2) Ownable(msg.sender) {
        require(_router != address(0), "Invalid router address");
        require(_poolManager != address(0), "Invalid pool manager address");
        require(_permit2 != address(0), "Invalid permit2 address");

        router = IUniversalRouter(_router);
        poolManager = IPoolManager(_poolManager);
        permit2 = IPermit2(_permit2);
    }

    /// @notice Grants full token approval to Permit2 and allows Universal Router to spend tokens
    function approveTokenWithPermit2(address token) external onlyOwner {
        IERC20(token).approve(address(permit2), type(uint256).max);
        permit2.approve(token, address(router), type(uint160).max, type(uint48).max);
    }

    /// @notice Executes a single-token swap using Uniswap V4 Universal Router, supports ETH and ERC20 input
    function swapExactInputSingle(PoolKey calldata key, bool zeroForOne, uint128 amountIn, uint128 minAmountOut) external payable nonReentrant {
        if (!zeroForOne) {
            address tokenIn = address(uint160(Currency.unwrap(key.currency1)));
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        }
                
        bytes memory commands = abi.encodePacked(uint8(Commands.V4_SWAP));
        bytes[] memory inputs = new bytes[](1);

        bytes memory actions = abi.encodePacked(
            uint8(Actions.SWAP_EXACT_IN_SINGLE),
            uint8(Actions.SETTLE_ALL),
            uint8(Actions.TAKE_ALL)
        );

        bytes[] memory params = new bytes[](3);
        // Construct the swap parameters
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,            // true if we're swapping token0 for token1
                amountIn: amountIn,          // amount of tokens we're swapping
                amountOutMinimum: minAmountOut, // minimum amount we expect to receive
                hookData: bytes("")             // no hook data needed
            })
        );

        // Payment and settlement currencies
        params[1] = abi.encode(zeroForOne ? key.currency0 : key.currency1, amountIn);
        params[2] = abi.encode(zeroForOne ? key.currency1 : key.currency0, minAmountOut);

        inputs[0] = abi.encode(actions, params);

        uint256 deadline = block.timestamp + 20;

        if (msg.value > 0) {
            // ETH as input
            uint256 balanceBefore = IERC20(Currency.unwrap(key.currency1)).balanceOf(address(this));
            router.execute{ value: amountIn }(commands, inputs, deadline);
            uint256 balanceAfter = IERC20(Currency.unwrap(key.currency1)).balanceOf(address(this));
            uint256 amountOut = balanceAfter - balanceBefore;
            bool success = IERC20(Currency.unwrap(key.currency1)).transfer(msg.sender, amountOut);
            require(success, "Failed to send LIM back to user");
            emit SwapExecuted(msg.sender, amountOut);
        } else {
            // ERC20 as input
            uint256 balanceBefore = address(this).balance;
            router.execute(commands, inputs, deadline);
            uint256 balanceAfter = address(this).balance;
            uint256 amountOut = balanceAfter - balanceBefore;
            (bool success, ) = msg.sender.call{value: amountOut}("");
            require(success, "Failed to send ETH back to user");
            emit SwapExecuted(msg.sender, amountOut);
        }
    }

    /// @notice Enables the contract to receive native ETH
    receive() external payable {}
}
