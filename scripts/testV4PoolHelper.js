const { ethers, network } = require("hardhat");

const HELPER_ADDRESS = "YOUR_DEPLOYED_HELPER_CONTRACT_ADDRESS";
const MOCKTOKEN_ADDRESS = "0x845EbEa7A03D1eE7A3ab2C1AA1d93D0aaecfBd35";
const MOCK_DEPLOYER = "0x179D189A7739d31Ba5a1839E3140958e20f1382e";
const WETH_ADDRESS = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73";

const WETH_ABI = [
  "function deposit() public payable",
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function transfer(address recipient, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)"
];

async function main() {
  await network.provider.send("hardhat_reset", [{
    forking: {
      jsonRpcUrl: "https://sepolia-rollup.arbitrum.io/rpc"
    }
  }]);

  const [owner] = await ethers.getSigners();

  // Get WETH and MOCK contracts
  const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);
  const mock = await ethers.getContractAt("IERC20", MOCKTOKEN_ADDRESS, owner);

  // Impersonate deployer to transfer MOCK
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [MOCK_DEPLOYER] });
  const mockDeployer = await ethers.getSigner(MOCK_DEPLOYER);
  const mockFromDeployer = await ethers.getContractAt("IERC20", MOCKTOKEN_ADDRESS, mockDeployer);
  await mockFromDeployer.transfer(owner.address, ethers.parseUnits("1000000", 18));
  await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [MOCK_DEPLOYER] });
  console.log("✅ Got 1M MOCK");

  // Wrap ETH
  await weth.deposit({ value: ethers.parseEther("100") });
  console.log("✅ Wrapped 100 ETH");

  // Deploy helper
  const Helper = await ethers.getContractFactory("V4PoolHelper");
  const helper = await Helper.deploy("0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317"); // PoolManager
  await helper.waitForDeployment();
  console.log("✅ Deployed V4PoolHelper at", helper.target);

  // Approve and transfer tokens to helper
  await mock.approve(helper.target, ethers.MaxUint256);
  await weth.approve(helper.target, ethers.MaxUint256);
  await helper.transferTokensIn(MOCKTOKEN_ADDRESS, WETH_ADDRESS);
  console.log("✅ Sent MOCK & WETH to helper");

  // Encode sqrtPriceX96 for 1 WETH = 1000 MOCK
  const sqrtPriceX96 = encodeSqrtPriceX96(1, 1000);

  const tx = await helper.initializeAndAddLiquidity({
    token0: MOCKTOKEN_ADDRESS,
    token1: WETH_ADDRESS,
    fee: 3000,
    tickSpacing: 60,
    sqrtPriceX96,
    tickLower: -1200,
    tickUpper: 1200,
    recipient: owner.address
  });

  await tx.wait();
  console.log("✅ Pool init call finished (may revert at unlock step as expected)");
}

// Helper to encode price sqrt
function encodeSqrtPriceX96(token0Amount, token1Amount) {
  const numerator = BigInt(token1Amount) * 10n ** 18n;
  const denominator = BigInt(token0Amount) * 10n ** 18n;
  const sqrtRatio = sqrt(numerator * (1n << 192n) / denominator);
  return sqrtRatio;
}

function sqrt(value) {
  if (value == 0n) return 0n;
  let z = value;
  let x = value / 2n + 1n;
  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }
  return z;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
