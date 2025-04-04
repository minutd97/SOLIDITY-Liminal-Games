const { ethers, network } = require("hardhat");

const MOCKTOKEN_ADDRESS = "0x845EbEa7A03D1eE7A3ab2C1AA1d93D0aaecfBd35";
const MOCK_DEPLOYER = "0x179D189A7739d31Ba5a1839E3140958e20f1382e";

const WETH_ADDRESS = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"; // Arbitrum WETH
const WETH_ABI = [
  "function deposit() public payable",
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function transfer(address recipient, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

const POOL_MANAGER = "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317";
const POSITION_MANAGER = "0xAc631556d3d4019C95769033B5E719dD77124BAc";

const PERMIT2_ADDRESS = "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768";
const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration) external"
];

const MAX_UINT160 = BigInt("0xffffffffffffffffffffffffffffffffffffffff");
const MAX_UINT48 = BigInt("0xffffffffffff");

async function main() {
  const [owner] = await ethers.getSigners();

  const PoolCreator = await ethers.getContractFactory("UniswapV4PoolCreator");
  const creator = await PoolCreator.deploy(POOL_MANAGER, POSITION_MANAGER, PERMIT2_ADDRESS);
  await creator.waitForDeployment();
  console.log("PoolCreator deployed to:", await creator.getAddress());

  await network.provider.request({ method: "hardhat_impersonateAccount", params: [MOCK_DEPLOYER] });
  const mockDeployer = await ethers.getSigner(MOCK_DEPLOYER);
  const mock = await ethers.getContractAt("IERC20", MOCKTOKEN_ADDRESS, mockDeployer);
  await mock.transfer(owner.address, ethers.parseUnits("1000000", 18));
  await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [MOCK_DEPLOYER] });

  const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);
  await weth.deposit({ value: ethers.parseEther("100") });
  console.log("✅ Wrapped 100 ETH into WETH");

  const poolCreatorAddress = await creator.getAddress();

  const mockAmount = ethers.parseUnits("1000000", 18);
  const wethAmount = ethers.parseUnits("100", 18);
  await mock.connect(owner).transfer(poolCreatorAddress, mockAmount);
  await weth.connect(owner).transfer(poolCreatorAddress, wethAmount);

  console.log(`✅ Transferred ${ethers.formatUnits(mockAmount, 18)} MOCK to PoolCreator`);
  console.log(`✅ Transferred ${ethers.formatUnits(wethAmount, 18)} WETH to PoolCreator`);

  console.log(`PoolCreator MOCK balance: ${ethers.formatUnits(await mock.balanceOf(poolCreatorAddress), 18)}`);
  console.log(`PoolCreator WETH balance: ${ethers.formatUnits(await weth.balanceOf(poolCreatorAddress), 18)}`);

  const sqrtPrice = await creator.getSqrtPriceX96(1000, 18, 18);
  console.log(`sqrtPrice ${sqrtPrice}`);

  console.log("Approving Permit2...");
  const tx1 = await creator.setupPermit2Approvals(WETH_ADDRESS, MOCKTOKEN_ADDRESS);
  await tx1.wait();

  const poolInput = {
    token0: WETH_ADDRESS,
    token1: MOCKTOKEN_ADDRESS,
    fee: 3000,
    tickSpacing: 60,
    sqrtPriceX96: sqrtPrice,
    tickLower: -1200,
    tickUpper: 1200,
    liquidity: ethers.parseUnits("1", 18), // will be calculated in contract
    recipient: owner.address
  };

  console.log("Minting pool...");
  const tx = await creator.connect(owner).createPoolAndAddLiquidity(poolInput);
  await tx.wait();

  console.log("✅ Pool created with WETH + MOCK");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

