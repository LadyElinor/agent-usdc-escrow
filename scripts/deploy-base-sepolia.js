const { ethers } = require('hardhat');
const nets = require('../config/networks');

async function main() {
  const { usdc, explorer } = nets.baseSepolia;
  const [deployer] = await ethers.getSigners();

  console.log('network: baseSepolia (84532)');
  console.log('deployer:', deployer.address);
  console.log('USDC:', usdc);

  const AgentEscrow = await ethers.getContractFactory('AgentEscrow');
  const escrow = await AgentEscrow.deploy(usdc);
  await escrow.waitForDeployment();

  const addr = await escrow.getAddress();
  console.log('AgentEscrow deployed:', addr);
  console.log('Explorer:', `${explorer}/address/${addr}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
