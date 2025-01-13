async function main() {
    // Get the signer accounts
    const [deployer, slotOwner, user] = await ethers.getSigners();
  
    // Replace these with your deployed contract addresses
    const gamblingTokenAddress = "0x290d5b2F55866d2357cbf0a31724850091dF5dd5"; // Replace with your GamblingToken contract address
    const proofOfBetAddress = "0xc01B37E3E9bb21DF97AF828B7E5933C7C763aAD0"; // Replace with your ProofOfBet contract address
  
    // Get the contract instances
    const token = await ethers.getContractAt("GamblingToken", gamblingTokenAddress);
    const proofOfBet = await ethers.getContractAt("ProofOfBet", proofOfBetAddress);
  
    // Example: Registering a Slot
    const registrationFee = ethers.parseUnits("10", 18);
    await token.connect(slotOwner).approve(proofOfBet.getAddress(), registrationFee);
    await proofOfBet.connect(slotOwner).registerSlot();
    console.log("Slot registered by:", slotOwner.address);
  
    // Example: Registering an Event
    const eventID = 1;
    await proofOfBet.connect(slotOwner).registerEvent(eventID);
    console.log("Event registered with ID:", eventID);
  
    // Example: Placing a Bet
    const betAmount = ethers.parseUnits("100", 18);
    await token.connect(user).approve(proofOfBet.getAddress(), betAmount);
    await proofOfBet.connect(user).placeBet(eventID, betAmount);
    console.log(`User ${user.address} placed a bet of ${ethers.formatUnits(betAmount, 18)} tokens on event ID ${eventID}`);
  
    // Example: Checking the Result (assuming the slot owner decides the result)
    const winQuota = ethers.parseUnits("200", 0); // 2x payout
    await proofOfBet.connect(slotOwner).checkEventResult(eventID, winQuota, user.address);
    console.log(`Event result checked. User ${user.address} won with a win quota of ${winQuota}`);
  
    // Example: Checking Balances
    const userBalance = await token.connect(user).balanceOf(user.address);
    console.log("User balance after winning:", ethers.formatUnits(userBalance, 18));
  
    const contractBalance = await token.balanceOf(proofOfBet.getAddress());
    console.log("ProofOfBet contract balance:", ethers.formatUnits(contractBalance, 18));
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  