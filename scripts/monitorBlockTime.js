const { ethers } = require("hardhat");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");

    let lastBlock = 0;
    let lastTimestamp = 0;

    const network = await ethers.provider.getNetwork();
    console.log(`Connected to chain ID: ${network.chainId}`);

    provider.on("block", async (blockNumber) => {
        const block = await provider.getBlock(blockNumber);
        if (lastBlock !== 0) {
            const blockTime = block.timestamp - lastTimestamp;
            console.log(`Block ${blockNumber} mined at ${new Date(block.timestamp * 1000)}. Block time: ${blockTime} seconds.`);
        }
        lastBlock = blockNumber;
        lastTimestamp = block.timestamp;
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
