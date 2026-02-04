// Helper: check balances + print faucet links/instructions for Base Sepolia USDC
// Note: Circle faucet flows may change; this script is intentionally conservative.

const { ethers } = require('ethers');
const nets = require('../config/networks');

const RPC_URL = process.env.RPC_URL || nets.baseSepolia.rpc;
const ADDRESS = process.env.ADDRESS;

if (!ADDRESS) {
  console.error('Set ADDRESS=<your wallet address>');
  process.exit(1);
}

const USDC = nets.baseSepolia.usdc;
const provider = new ethers.JsonRpcProvider(RPC_URL);

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

(async () => {
  const eth = await provider.getBalance(ADDRESS);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, provider);
  const [dec, sym, bal] = await Promise.all([usdc.decimals(), usdc.symbol(), usdc.balanceOf(ADDRESS)]);

  const fmtEth = ethers.formatEther(eth);
  const fmtUsdc = ethers.formatUnits(bal, dec);

  console.log('RPC_URL:', RPC_URL);
  console.log('Address:', ADDRESS);
  console.log('ETH:', fmtEth);
  console.log(`${sym}:`, fmtUsdc);

  console.log('\nFunding notes:');
  console.log('- You need Base Sepolia ETH for gas. Try: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet');
  console.log('- You need Base Sepolia USDC (Circle testnet). If a Circle faucet is available, use it; otherwise mint/bridge via whatever hackathon tooling provides.');
  console.log('- USDC address (Base Sepolia):', USDC);
})();
