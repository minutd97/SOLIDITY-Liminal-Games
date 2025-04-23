const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LIMGovernor", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy LIM token
    const Token = await ethers.getContractFactory("LiminalToken");
    const limToken = await Token.deploy();
    await limToken.waitForDeployment();

    // Delegate to self to activate vote power
    await limToken.connect(owner).delegate(owner.address);

    // Deploy Governor
    const Governor = await ethers.getContractFactory("LIMGovernor");
    const limGovernor = await Governor.deploy(limToken.getAddress());
    await limGovernor.waitForDeployment();

    return { owner, user1, user2, limToken, limGovernor };
  }

  it("should allow proposal creation and voting", async function () {
    const { owner, limToken, limGovernor } = await loadFixture(deployFixture);
    const proposalDescription = "Proposal #1: Test delegate call";

    const calldata = limToken.interface.encodeFunctionData("delegate", [owner.address]);
    const targets = [await limToken.getAddress()];
    const values = [0];
    const calldatas = [calldata];

    // Create proposal
    const tx = await limGovernor.propose(targets, values, calldatas, proposalDescription);
    const receipt = await tx.wait();
    const proposalId = receipt.logs.find(log => log.eventName === "ProposalCreated").args.proposalId;

    // Wait for voting delay
    await ethers.provider.send("evm_mine");

    // Vote FOR
    await limGovernor.castVote(proposalId, 1);

    // Wait for voting period to end
    const votingPeriod = await limGovernor.votingPeriod();
    await time.advanceBlocks(votingPeriod);

    // Check if proposal succeeded
    const state = await limGovernor.state(proposalId);
    expect(state).to.equal(4); // 4 = Succeeded
  });
});