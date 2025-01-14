const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Uniswap V3 Liquidity Manager - Local Testing", function () {
    let liquidityManager, tokenLOT;

    const FACTORY = "0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e"; // Uniswap V3 Factory
    const POSITION_MANAGER = "0x6b2937Bde17889EDCf8fbD8dE31C3C2a70Bc4d65"; // Uniswap V3 Nonfungible Position Manager
    const SWAP_ROUTER = "0x101F443B4d1b059569D643917553c771E1b9663E"; // Uniswap V3 Swap router

    const WETH_ADDRESS = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"; // WETH address on Arbitrum Sepolia testnet : 0x980B62Da83eFf3D4576C647993b0c1D7faf17c73, main : 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1
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

    async function deployContractsFixture() {
        const [owner] = await ethers.getSigners();

        // Deploy LotteryToken contract
        const LotteryToken = await ethers.getContractFactory("LotteryToken");
        tokenLOT = await LotteryToken.deploy();
        await tokenLOT.waitForDeployment();

        console.log("Lottery Token deployed to:", await tokenLOT.getAddress());

        // Deploy the liquidity manager contract
        const UniswapV3LiquidityManager = await ethers.getContractFactory("UniswapV3LiquidityManager");
        liquidityManager = await UniswapV3LiquidityManager.deploy(FACTORY, POSITION_MANAGER, SWAP_ROUTER);
        await liquidityManager.waitForDeployment();

        console.log("Liquidity Manager deployed to:", await liquidityManager.getAddress());
        console.log("Owner: ", owner.address);

        await wrapETH("1000", owner);

        await log_TokenBalance(tokenLOT, "$LOT", owner.address, "OWNER");

        return { owner };
    }

    describe("Full test", function () {
        it("Testing", async function () {
            const { owner } = await loadFixture(deployContractsFixture);

            const poolCreated = await liquidityManager.connect(owner).createPoolAndInit(WETH_ADDRESS, tokenLOT.getAddress());
            console.log("Pool created successfully : ", poolCreated);

            const amount0 = ethers.parseUnits("100", 18); // 100 WETH
            const amount1 = ethers.parseUnits("100", 18); // 100 $LOT
            const tickLower = -6000;
            const tickUpper = 6000;

            const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);

            // Approve WETH and $LOT for the liquidity manager
            await weth.connect(owner).approve(liquidityManager.getAddress(), amount0);
            //console.log("Add Liquidity : approved WETH");
    
            await tokenLOT.connect(owner).approve(liquidityManager.getAddress(), amount1);
            //console.log("Add Liquidity : approved $LOT");

            await liquidityManager.connect(owner).addLiquidity(
                WETH_ADDRESS,
                tokenLOT.getAddress(),
                amount0,
                amount1,
                tickLower,
                tickUpper,
            );
            console.log("Liquidity added successfully");
            await log_TokenBalance(weth, "WETH", owner.address, "OWNER");
            await log_TokenBalance(tokenLOT, "$LOT", owner.address, "OWNER");
            
            const amountIn = ethers.parseUnits("1", 18); // 1 WETH

            //Approve WETH for the for the liquidity manager
            await weth.connect(owner).approve(liquidityManager.getAddress(), amountIn);
            console.log("Swap : approved WETH");

            const swapReturn = await liquidityManager.connect(owner).swapExactInputSingle(WETH_ADDRESS, tokenLOT.getAddress(), amountIn);
            console.log("Swap executed successfully : ", swapReturn);

            //tokenLOT.connect(owner).approve(liquidityManager.getAddress(), amountIn);
            //console.log("Swap : approved $LOT");

            //const swapReturn = await liquidityManager.connect(owner).swapExactInputSingle(tokenLOT.getAddress(), WETH_ADDRESS, amountIn);
            //console.log("Swap executed successfully : ", swapReturn);

            // // Approve WETH and $LOT for the liquidity manager
            // await weth.connect(owner).approve(POSITION_MANAGER, amount0);
            // console.log("Approved WETH");

            // await tokenLOT.connect(owner).approve(POSITION_MANAGER, amount1);
            // console.log("Approved Lottery Token");

            // new_positionManager = new ethers.Contract(
            //     POSITION_MANAGER,
            //     [
            //         "function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) external payable returns (uint256, uint128, uint256, uint256)"
            //     ],
            //     owner
            // );
            // //Mint a position
            // const tx = await new_positionManager.mint([
            //     WETH_ADDRESS,// token0
            //     tokenLOT.getAddress(), // token1
            //     3000, // Fee tier
            //     tickLower, // tickLower
            //     tickUpper, // tickUpper
            //     amount0, // amount0Desired
            //     amount1, // amount1Desired
            //     0, // amount0Min
            //     0, // amount1Min
            //     owner.address, // recipient
            //     Math.floor(Date.now() / 1000) + 60 * 10 // deadline
            // ]);
            // const receipt = await tx.wait();
            // console.log("Position minted successfully:", receipt);

            // const ISwapRouter_ABI = [
            //     "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) external payable returns (uint256)",
            // ];
            // const ISwapRouter = new ethers.Contract(
            //     SWAP_ROUTER, // Uniswap V3 Swap Router on Arbitrum Sepolia
            //     ISwapRouter_ABI,
            //     owner
            // );

            // const amountIn = ethers.parseUnits("1", 18); // 1 WETH
            // //const amountOutMin = ethers.parseUnits("0.9", 18); // Minimum 0.9 $LOT

            // // Approve WETH for the swap router
            // await weth.connect(owner).approve(SWAP_ROUTER, amountIn);
            // console.log("Swap : approved WETH");

            // // Execute the swap
            // await ISwapRouter.exactInputSingle([
            //     WETH_ADDRESS, // tokenIn
            //     tokenLOT.getAddress(), // tokenOut
            //     3000, // Fee tier
            //     owner.getAddress(), // Recipient
            //     Math.floor(Date.now() / 1000) + 60 * 10, // Deadline: 10 minutes from now
            //     amountIn, // Amount In
            //     0, // Minimum Amount Out
            //     0, // sqrtPriceLimitX96
            // ]);
    
            //console.log("Swap executed successfully");
        })
    })

    async function log_TokenBalance(token, tokenName, userAddr, userName){
        let tokenBalance = await token.balanceOf(userAddr);
        console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
    }

    async function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
})