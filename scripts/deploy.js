const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('deployer:', deployer.address);

  // For local dev, deploy a MockUSDC.
  const MockUSDC = await ethers.getContractFactory('MockUSDC');
  const usdc = await MockUSDC.deploy('Mock USDC', 'USDC', 6);
  await usdc.waitForDeployment();
  console.log('MockUSDC:', await usdc.getAddress());

  const AgentEscrow = await ethers.getContractFactory('AgentEscrow');
  const escrow = await AgentEscrow.deploy(await usdc.getAddress());
  await escrow.waitForDeployment();
  console.log('AgentEscrow:', await escrow.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
