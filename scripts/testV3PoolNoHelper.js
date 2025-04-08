const { ethers } = require("hardhat");

const POOL_FEE = 3000; // Fee tier: 0.3%
var tokenLIM, tokenWETH, factoryContract, positionManagerContract, swapRouterContract;

// Setup WETH
const WETH_ADDRESS = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // WETH address on Arbitrum Sepolia
const ERC20_ABI = [
    "function deposit() public payable",
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address recipient, uint256 amount) external returns (bool)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function totalSupply() external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)"
];

// Setup Uniswap V3 Factory, Position Manager and Swap Router
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

const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
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

async function main() {
    // Setup and Get Signer
    const [deployer] = await ethers.getSigners();
    console.log("Deployer Address:", deployer.address);

    // Deploy LiminalToken
    tokenLIM = await deployContract("LiminalToken");

    // Deploy WETH and Wrap some ETH into WETH
    tokenWETH = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, deployer);
    await wrapSomeETH("200");

    // Deploy Uniswap V3 Factory, Position Manager and Swap Router
    factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryABI, deployer);
    positionManagerContract = new ethers.Contract(POSITION_MANAGER_ADDRESS, positionManagerABI, deployer);
    swapRouterContract = new ethers.Contract(SWAP_ROUTER_ADDRESS, swapRouterABI, deployer);

    // Create the Uniswap pool
    await createPool();

    // Get WETH blanace
    await log_TokenBalance(tokenWETH, "WETH", deployer.address, "Deployer");

    // Add Liquidity to the Pool
    await addLiquidity("100", "100", deployer.address);

    // Get pool info
    await getPoolInfo(deployer);

    // Get WETH blanace
    await log_TokenBalance(tokenWETH, "WETH", deployer.address, "Deployer");

    // Step 6: Perform a Swap
    await swapExactInputSingle("1", true, deployer.address);

    // Get pool info
    await getPoolInfo(deployer);
}

async function deployContract(contractName) {
    const ContractFactory = await ethers.getContractFactory(contractName);
    const deployedContract = await ContractFactory.deploy();
    await deployedContract.waitForDeployment();
    console.log(contractName, "deployed to:", deployedContract.target);
    return deployedContract; // Return the deployed contract
}

async function wrapSomeETH(ethValue){
    await tokenWETH.deposit({ value: ethers.parseEther(ethValue) });
    console.log("Wrapped", ethValue, "ETH into WETH");
}

async function createPool(){
    console.log("Create Pool...");
    const sqrtPriceX96 = "79228162514264337593543950336"; // Price 1:1 in sqrtPriceX96 format
    const poolTx = await positionManagerContract.createAndInitializePoolIfNecessary(
        tokenLIM.getAddress(),
        tokenWETH.getAddress(),
        POOL_FEE,
        sqrtPriceX96
    );
    await poolTx.wait();
    console.log("Create Pool : Success!");
    return poolTx;
}

async function addLiquidity(token0Amount, token1Amount, recipient){
    console.log("Add Liquidity...");
    const mintParams = {
        token0: tokenLIM.getAddress(),
        token1: tokenWETH.getAddress(),
        fee: POOL_FEE,
        tickLower: -600, // Adjust based on tick spacing
        tickUpper: 600,
        amount0Desired: ethers.parseEther(token0Amount), // 1000 $LOT
        amount1Desired: ethers.parseEther(token1Amount), // 1 WETH
        amount0Min: 0,
        amount1Min: 0,
        recipient: recipient,
        deadline: Math.floor(Date.now() / 1000) + 60 * 10 // 10 minutes from now
    };

    console.log("Add Liquidity: Approving tokens...");
    // Approve tokens for minting
    await tokenLIM.approve(POSITION_MANAGER_ADDRESS, ethers.parseEther(token0Amount));
    await tokenWETH.approve(POSITION_MANAGER_ADDRESS, ethers.parseEther(token1Amount));

    const mintTx = await positionManagerContract.mint(mintParams);
    await mintTx.wait();
    console.log("Add Liquidity: Success!");
    return mintTx;
}

async function swapExactInputSingle(amountIn, isWeth, recipient){
    console.log("Swap Input Single...");
    // Approve the swap router to spend tokenIn (WETH in this case)
    let swapAmountIn = ethers.parseEther(amountIn);
    console.log("Swap Input Single : Approving tokens...");

    if (isWeth)
        await tokenWETH.approve(SWAP_ROUTER_ADDRESS, swapAmountIn);
    else
        await tokenLIM.approve(SWAP_ROUTER_ADDRESS, swapAmountIn);

    const swapParams = {
        tokenIn: tokenWETH.getAddress(),
        tokenOut: tokenLIM.getAddress(),
        fee: POOL_FEE,
        recipient: recipient,
        deadline: Math.floor(Date.now() / 1000) + 60 * 10, // 10 minutes from now
        amountIn: swapAmountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    };

    // Call the exactInputSingle function
    const swapTx = await swapRouterContract.exactInputSingle(swapParams);
    console.log("Swap Input Single : Success!");
    return swapTx;
}

async function getPoolInfo(owner){
    console.log("_____________POOL INFO_____________")
    const poolAddress = await factoryContract.getPool(tokenLIM.getAddress(), tokenWETH.getAddress(), POOL_FEE);
    if (poolAddress === ethers.ZeroAddress) {
        console.error("Pool does not exist for the specified tokens and fee tier.");
    } else {
        console.log("Pool exists, Address:", poolAddress);
    }

    const poolContract = new ethers.Contract(poolAddress, [
        "function liquidity() external view returns (uint128)",
        "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
    ], owner);
    
    let liquidity = await poolContract.liquidity();
    console.log("Pool Liquidity:", liquidity);
    const slot0 = await poolContract.slot0();
    console.log("Slot0 Details:", slot0);
    console.log("Current sqrtPriceX96:", slot0.sqrtPriceX96);
    console.log("Current Tick:", slot0.tick);
    console.log("___________________________________")
}

async function log_TokenBalance(token, tokenName, userAddr, userName){
    let tokenBalance = await token.balanceOf(userAddr);
    console.log(`${userName} ${tokenName} BALANCE: ${ethers.formatEther(tokenBalance)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
