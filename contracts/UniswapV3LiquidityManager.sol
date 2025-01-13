// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "hardhat/console.sol";

contract UniswapV3LiquidityManager {
    using SafeERC20 for IERC20;

    address public immutable factory;
    address public immutable positionManager;
    address public immutable swapRouter;
    address public immutable owner;

    uint24 public constant POOL_FEE = 3000; // Fee tier: 0.3%

    constructor(address _factory, address _positionManager, address _swapRouter) {
        factory = _factory; // Uniswap V3 Factory
        positionManager = _positionManager; // Uniswap V3 Nonfungible Position Manager
        swapRouter = _swapRouter; // Uniswap V3 Swap Router
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // Create a pool and init
    function createPoolAndInit(address _token0, address _token1) external onlyOwner returns (address pool) {
        address newPool = IUniswapV3Factory(factory).createPool(_token0, _token1, POOL_FEE);
        require(newPool != address(0), "Pool creation failed");

        uint160 sqrtPriceX96 = 79228162514264337593543950336; // Example value for ~1:1 price
        IUniswapV3Pool(newPool).initialize(sqrtPriceX96);
        return newPool;
    }

    // Add liquidity to the pool
    function addLiquidity(
        address _token0,
        address _token1,
        uint256 _amount0,
        uint256 _amount1,
        int24 _tickLower,
        int24 _tickUpper
    ) external onlyOwner {
        // Transfer tokens to this contract
        IERC20(_token0).transferFrom(msg.sender, address(this), _amount0);
        IERC20(_token1).transferFrom(msg.sender, address(this), _amount1);
        
        // Approve tokens
        IERC20(_token0).approve(positionManager, _amount0);
        IERC20(_token1).approve(positionManager, _amount1);

        INonfungiblePositionManager(positionManager).mint(INonfungiblePositionManager.MintParams({
                token0: _token0,
                token1: _token1,
                fee: POOL_FEE,
                tickLower: _tickLower,
                tickUpper: _tickUpper,
                amount0Desired: _amount0,
                amount1Desired: _amount1,
                amount0Min: 0,
                amount1Min: 0,
                recipient: msg.sender,
                deadline: block.timestamp
            }));
    }

    /// Swaps a fixed amount of _tokenIn for a maximum possible amount of _tokenOut
    function swapExactInputSingle(address _tokenIn, address _tokenOut, uint256 _amountIn) external returns (uint256 amountOut) {
        // msg.sender must approve this contract

        // Transfer the specified amount of _tokenIn to this contract.
        TransferHelper.safeTransferFrom(_tokenIn, msg.sender, address(this), _amountIn);

        // Approve the router to spend _tokenIn.
        TransferHelper.safeApprove(_tokenIn, address(swapRouter), _amountIn);

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: _tokenIn,
                tokenOut: _tokenOut,
                fee: POOL_FEE,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: _amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        console.log("SWAP Router addr: ", swapRouter);

        // The call to `exactInputSingle` executes the swap.
        amountOut = ISwapRouter(swapRouter).exactInputSingle(params);
        return amountOut;
    }

    // Remove liquidity from the pool
    function removeLiquidity(uint256 tokenId, uint128 liquidity) external onlyOwner {
        INonfungiblePositionManager(positionManager).decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );

        // Collect tokens
        INonfungiblePositionManager(positionManager).collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: msg.sender,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
    }
}
