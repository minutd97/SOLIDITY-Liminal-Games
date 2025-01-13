const { ethers } = require("hardhat");

async function main() {
  console.log("--------------------------------------------------------");
  console.log("--------------------------------------------------------");

  const [deployer, supplier] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy GamblingToken contract
  const GamblingToken = await ethers.getContractFactory("GamblingToken");
  const token = await GamblingToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("GamblingToken deployed to:", tokenAddress);

  // Deploy Liquidity contract
  const LiquidityContract = await ethers.getContractFactory("LiquidityContract");
  const liquidityContract = await LiquidityContract.deploy(tokenAddress, 1000); // second argument is a placeholder
  await liquidityContract.waitForDeployment();
  const liquidityContractAddress = await liquidityContract.getAddress();
  console.log("LiquidityContract deployed to:", liquidityContractAddress);

  // Deploy Supplier contract
  const SupplierContract = await ethers.getContractFactory("SupplierContract");
  const supplierContract = await SupplierContract.deploy(tokenAddress);
  await supplierContract.waitForDeployment();
  const supplierContractAddress = await supplierContract.getAddress();
  console.log("SupplierContract deployed to:", supplierContractAddress);

  // Deploy ProtocolContract contract
  const ProtocolContract = await ethers.getContractFactory("ProtocolContract");
  const protocolContract = await ProtocolContract.deploy(tokenAddress, liquidityContractAddress, supplierContractAddress);
  await protocolContract.waitForDeployment();
  const protocolContractAddress = await protocolContract.getAddress();
  console.log("ProtocolContract deployed to:", protocolContractAddress);

  // Grant MINTER_ROLE to ProtocolContract contract in GamblingToken
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  await token.grantRole(MINTER_ROLE, protocolContractAddress);
  console.log("Granted MINTER_ROLE to ProtocolContract");

  await protocolContract.connect(deployer).updateRegistrationFee(supplier.address, ethers.parseUnits("10", 18));
  //await protocolContract.connect(supplier).register({ value: ethers.parseUnits("10", 18) });
  console.log(`ProtocolContract: Registration fee added as 10 ETH, ${ethers.parseUnits("10", 18)}`);

  // Print out the contract addresses for reference
  // console.log("\nContracts deployed:");
  // console.log("Token:", token.getAddress());
  // console.log("LiquidityContract:", liquidityContract.getAddress());
  // console.log("SupplierContract:", supplierContract.getAddress());
  // console.log("ProtocolContract:", protocolContract.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
