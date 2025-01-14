const { ethers } = require("hardhat");

async function main() {
    // Step 1: Setup and Get Signer
    const [deployer] = await ethers.getSigners();
    console.log("Deployer Address:", deployer.address);

    // Step 2: Deploy LotteryToken
    const LotteryToken = await ethers.getContractFactory("LotteryToken");
    const lotteryToken = await LotteryToken.deploy();
    await lotteryToken.waitForDeployment();
    console.log("LotteryToken deployed to:", lotteryToken.target);

    // Step 3: Deploy WETH
    const WETH_ADDRESS = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // WETH address on Arbitrum Sepolia
    const WETH_ABI = [
        "function deposit() public payable",
        "function balanceOf(address account) external view returns (uint256)",
        "function approve(address spender, uint256 value) external returns (bool)"
    ];
    const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, deployer);

    // Wrap some ETH into WETH
    console.log("Wrapping ETH into WETH...");
    const depositTx = await weth.deposit({ value: ethers.parseEther("10") }); // Wrap 10 ETH
    await depositTx.wait();
    console.log("Wrapped 10 ETH into WETH");

    // Step 4: Setup Uniswap V3 Factory and Position Manager
    const FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const factoryABI = [
        {
          "inputs": [
            { "internalType": "address", "name": "tokenA", "type": "address" },
            { "internalType": "address", "name": "tokenB", "type": "address" },
            { "internalType": "uint24", "name": "fee", "type": "uint24" }
          ],
          "name": "getPool",
          "outputs": [{ "internalType": "address", "name": "pool", "type": "address" }],
          "stateMutability": "view",
          "type": "function"
        }
      ];
    const factory = new ethers.Contract(FACTORY_ADDRESS, factoryABI, deployer);

    const POSITION_MANAGER_ADDRESS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
    const positionManagerABI = [
        {
        "inputs": [
            { "internalType": "address", "name": "token0", "type": "address" },
            { "internalType": "address", "name": "token1", "type": "address" },
            { "internalType": "uint24", "name": "fee", "type": "uint24" },
            { "internalType": "uint160", "name": "sqrtPriceX96", "type": "uint160" }
        ],
        "name": "createAndInitializePoolIfNecessary",
        "outputs": [{ "internalType": "address", "name": "pool", "type": "address" }],
        "stateMutability": "nonpayable",
        "type": "function"
        },
        {
        "inputs": [
            {
            "components": [
                { "internalType": "address", "name": "token0", "type": "address" },
                { "internalType": "address", "name": "token1", "type": "address" },
                { "internalType": "uint24", "name": "fee", "type": "uint24" },
                { "internalType": "int24", "name": "tickLower", "type": "int24" },
                { "internalType": "int24", "name": "tickUpper", "type": "int24" },
                { "internalType": "uint256", "name": "amount0Desired", "type": "uint256" },
                { "internalType": "uint256", "name": "amount1Desired", "type": "uint256" },
                { "internalType": "uint256", "name": "amount0Min", "type": "uint256" },
                { "internalType": "uint256", "name": "amount1Min", "type": "uint256" },
                { "internalType": "address", "name": "recipient", "type": "address" },
                { "internalType": "uint256", "name": "deadline", "type": "uint256" }
            ],
            "internalType": "struct INonfungiblePositionManager.MintParams",
            "name": "params",
            "type": "tuple"
            }
        ],
        "name": "mint",
        "outputs": [
            { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
            { "internalType": "uint128", "name": "liquidity", "type": "uint128" },
            { "internalType": "uint256", "name": "amount0", "type": "uint256" },
            { "internalType": "uint256", "name": "amount1", "type": "uint256" }
        ],
        "stateMutability": "payable",
        "type": "function"
        }
    ];  
    const positionManager = new ethers.Contract(POSITION_MANAGER_ADDRESS, positionManagerABI, deployer);

    // Create the Uniswap pool
    console.log("Creating the Uniswap V3 pool...");
    const POOL_FEE = 3000; // Fee tier: 0.3%
    const sqrtPriceX96 = "79228162514264337593543950336"; // Price 1:1 in sqrtPriceX96 format
    const poolTx = await positionManager.createAndInitializePoolIfNecessary(
        lotteryToken.target,
        WETH_ADDRESS,
        POOL_FEE,
        sqrtPriceX96
    );
    await poolTx.wait();
    console.log("Uniswap V3 pool created!");

    // Step 5: Add Liquidity to the Pool
    console.log("Adding liquidity to the pool...");
    const mintParams = {
        token0: lotteryToken.target,
        token1: WETH_ADDRESS,
        fee: POOL_FEE,
        tickLower: -600, // Adjust based on tick spacing
        tickUpper: 600,
        amount0Desired: ethers.parseEther("1000"), // 1000 $LOT
        amount1Desired: ethers.parseEther("1"), // 1 WETH
        amount0Min: 0,
        amount1Min: 0,
        recipient: deployer.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 10 // 10 minutes from now
    };

    console.log("Approving tokens...");
    // Approve tokens for minting
    await lotteryToken.approve(POSITION_MANAGER_ADDRESS, ethers.parseEther("1000"));
    await weth.approve(POSITION_MANAGER_ADDRESS, ethers.parseEther("1"));

    console.log("Tokens Approved!");

    const mintTx = await positionManager.mint(mintParams);
    await mintTx.wait();
    console.log("Liquidity added to the pool!");

    const poolAddress = await factory.getPool(lotteryToken.target, WETH_ADDRESS, POOL_FEE);
    if (poolAddress === ethers.ZeroAddress) {
        console.error("Pool does not exist for the specified tokens and fee tier.");
    } else {
        console.log("Pool exists, Address:", poolAddress);
    }

    const poolContract = new ethers.Contract(poolAddress, [
        "function liquidity() external view returns (uint128)",
        "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
    ], deployer);
    
    let liquidity = await poolContract.liquidity();
    console.log("Pool Liquidity:", liquidity);
    const slot0 = await poolContract.slot0();
    console.log("Slot0 Details:", slot0);
    console.log("Current sqrtPriceX96:", slot0.sqrtPriceX96);
    console.log("Current Tick:", slot0.tick);

    // Step 6: Perform a Swap
    console.log("Performing a swap...");
    const swapRouterABI = [
        {
        "inputs": [
            {
            "components": [
                { "internalType": "address", "name": "tokenIn", "type": "address" },
                { "internalType": "address", "name": "tokenOut", "type": "address" },
                { "internalType": "uint24", "name": "fee", "type": "uint24" },
                { "internalType": "address", "name": "recipient", "type": "address" },
                { "internalType": "uint256", "name": "deadline", "type": "uint256" },
                { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
                { "internalType": "uint256", "name": "amountOutMinimum", "type": "uint256" },
                { "internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160" }
            ],
            "internalType": "struct ISwapRouter.ExactInputSingleParams",
            "name": "params",
            "type": "tuple"
            }
        ],
        "name": "exactInputSingle",
        "outputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }],
        "stateMutability": "payable",
        "type": "function"
        }
    ];
    const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const swapRouter = new ethers.Contract(SWAP_ROUTER_ADDRESS, swapRouterABI, deployer);

    const wethBalance = await weth.balanceOf(deployer.address);
    console.log("WETH Balance:", ethers.formatEther(wethBalance));

    // Approve the swap router to spend tokenIn (WETH in this case)
    let swapAmountIn = ethers.parseEther("1");
    console.log("Approving tokens for the swap...");
    await weth.approve(SWAP_ROUTER_ADDRESS, swapAmountIn);
    console.log("Approval successful!");
    // const allowance = await lotteryToken.allowance(deployer.address, SWAP_ROUTER_ADDRESS);
    // console.log("Allowance for Swap Router:", ethers.formatEther(allowance));

    const currentBlock = await ethers.provider.getBlock("latest");
    const swapParams = {
        tokenIn: WETH_ADDRESS,
        tokenOut: lotteryToken.target,
        fee: POOL_FEE,
        recipient: deployer.address,
        deadline: currentBlock.timestamp + 600, // 10 minutes
        amountIn: swapAmountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    };
  
    const tokenIn = ethers.getAddress(swapParams.tokenIn);
    const tokenOut = ethers.getAddress(swapParams.tokenOut);

    if (tokenIn > tokenOut) {
        console.error("Token order mismatch. Swap might fail.");
    } else {
        console.log("Token order matches pool configuration.");
    }

    // try {
    //     const staticResult = await swapRouter.exactInputSingle.staticCall(swapParams);
    //     console.log("Static Call Result:", staticResult);
    // } catch (error) {
    //     console.error("Static Call Error:", error);
    //     console.log("Swap Params:", swapParams);
    // }

    // Call the exactInputSingle function
    const swapTx = await swapRouter.exactInputSingle(swapParams, { gasLimit: 1000000 });
    const swapReceipt = await swapTx.wait();
    console.log("Swap completed successfully! Amount Out:", swapReceipt);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
