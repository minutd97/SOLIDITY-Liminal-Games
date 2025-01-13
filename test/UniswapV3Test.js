const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Uniswap V3 Liquidity Manager - Local Testing", function () {
    let liquidityManager, tokenLOT, owner;

    const POSITION_MANAGER = "0x6b2937Bde17889EDCf8fbD8dE31C3C2a70Bc4d65"; // Uniswap V3 Nonfungible Position Manager
    const FACTORY = "0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e"; // Uniswap V3 Factory

    const WETH_ADDRESS = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"; // WETH address on Arbitrum Sepolia
    const WETH_ABI = [
        "function deposit() public payable",
        "function balanceOf(address account) external view returns (uint256)",
        "function approve(address spender, uint256 value) external returns (bool)",
    ];

    async function wrapETH(amount, signer) {
        const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, signer);
        const tx = await weth.deposit({ value: ethers.parseUnits(amount, 18) });
        await tx.wait();
        const balance = await weth.balanceOf(signer.address);
        console.log(`Wrapped ${amount} ETH into WETH. WETH balance:`, ethers.formatEther(balance));
    }

    before(async function () {
        [owner] = await ethers.getSigners();

        await wrapETH("1000", owner);

        // Deploy LotteryToken contract
        const LotteryToken = await ethers.getContractFactory("LotteryToken");
        tokenLOT = await LotteryToken.deploy();
        await tokenLOT.waitForDeployment();

        console.log("Lottery Token deployed to:", await tokenLOT.getAddress());

        // Deploy the liquidity manager contract
        const UniswapV3LiquidityManager = await ethers.getContractFactory("UniswapV3LiquidityManager");
        liquidityManager = await UniswapV3LiquidityManager.deploy(POSITION_MANAGER, FACTORY);
        await liquidityManager.waitForDeployment();

        console.log("Liquidity Manager deployed to:", await liquidityManager.getAddress());
        console.log("Owner: ", owner.address);
    });

    it("Should create a new pool", async function () {
        //const sqrtPriceX96 = 79228162514264337593543950336n; // Example value for ~1:1 price
        const poolCreated = await liquidityManager.createPool(tokenLOT.getAddress(), WETH_ADDRESS); //sqrtPriceX96
        console.log("Pool created successfully : ", poolCreated);
    });

    it("Should add liquidity to the pool", async function () {
        const amount0 = ethers.parseUnits("100", 18); // 100 WETH
        const amount1 = ethers.parseUnits("100", 18); // 100 $LOT
        const tickLower = 20;
        const tickUpper = 60;

        const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);

        // Approve WETH and $LOT for the liquidity manager
        // const wethApproveTx = await weth.connect(owner).approve(POSITION_MANAGER, amount0);
        // await wethApproveTx.wait();
        // console.log("Approved WETH");

        // const lotApproveTx = await tokenLOT.connect(owner).approve(POSITION_MANAGER, amount1);
        // await lotApproveTx.wait();
        // console.log("Approved Lottery Token");

        // new_positionManager = new ethers.Contract(
        //     POSITION_MANAGER,
        //     [
        //         "function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) external payable returns (uint256, uint128, uint256, uint256)"
        //     ],
        //     owner
        // );

        // // Mint a position
        // const tx = await new_positionManager.mint({
        //     token0: WETH_ADDRESS, // token0
        //     token1: await tokenLOT.getAddress(), // token1
        //     fee: 3000, // Fee tier
        //     tickLower: -60, // tickLower
        //     tickUpper: 60, // tickUpper
        //     amount0Desired: amount0, // amount0Desired
        //     amount1Desired: amount1, // amount1Desired
        //     amount0Min: 0, // amount0Min
        //     amount1Min: 0, // amount1Min
        //     recipient: owner.address, // recipient
        //     deadline: Math.floor(Date.now() / 1000) + 60 * 10 // deadline
        // }, 
        // {
        //     gasLimit: 3000000 // Adjust gas limit as needed
        // });
        // const receipt = await tx.wait();

        // console.log("Position minted successfully:", receipt);

        // Add liquidity
        const tx = await liquidityManager.connect(owner).addLiquidity(
            tokenLOT.getAddress(),
            WETH_ADDRESS,
            amount0,
            amount1,
            tickLower,
            tickUpper,
        );
        await tx.wait();
        console.log("Liquidity added successfully");
    });

    it("Should swap tokens using Uniswap V3", async function () {
        const ISwapRouter_ABI = [
            "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) external payable returns (uint256)",
        ];
        const ISwapRouter = new ethers.Contract(
            "0x101F443B4d1b059569D643917553c771E1b9663E", // Uniswap V3 Swap Router on Arbitrum Sepolia
            ISwapRouter_ABI,
            owner
        );

        const amountIn = ethers.parseUnits("1", 18); // 1 WETH
        const amountOutMin = ethers.parseUnits("0.9", 18); // Minimum 0.9 $LOT

        const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);

        // Approve WETH for the swap router
        const approveTx = await weth.approve(ISwapRouter.address, amountIn);
        await approveTx.wait();

        // Execute the swap
        const tx = await ISwapRouter.exactInputSingle([
            WETH_ADDRESS, // tokenIn
            await tokenLOT.getAddress(), // tokenOut
            3000, // Fee tier
            owner.address, // Recipient
            Math.floor(Date.now() / 1000) + 60 * 10, // Deadline: 10 minutes from now
            amountIn, // Amount In
            amountOutMin, // Minimum Amount Out
            0, // sqrtPriceLimitX96
        ]);
        await tx.wait();

        console.log("Swap executed successfully");
    });
});
