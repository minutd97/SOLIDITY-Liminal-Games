async function main() {
  // Get the contract factory for SimpleBlockGame
  console.log("Deploying SimpleBlockGame contract...");
  
  const SimpleBlockGame = await ethers.getContractFactory("SimpleBlockGame");
  const simpleBlockGame = await SimpleBlockGame.deploy();
  await simpleBlockGame.waitForDeployment();
  
  const simpleBlockGameAddress = await simpleBlockGame.getAddress();

  console.log("SimpleBlockGame deployed successfully!");
  console.log("Contract Address:", simpleBlockGameAddress);

  // Log the deployment block number
  const currentBlock = await ethers.provider.getBlock("latest");
  console.log("Deployed at Block Number:", currentBlock.number);

  // Optional: Log the contract's initial state
  const gameBlockDuration = await simpleBlockGame.gameBlockDuration();
  console.log("Game Block Duration (in blocks):", gameBlockDuration.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
      console.error("Deployment failed:", error);
      process.exit(1);
  });