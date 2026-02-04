#!/usr/bin/env node

// provider-bot.js
// Watches JobCreated where provider == me, then accept -> (mock) execute -> markComplete.

const { ethers } = require('ethers');
const nets = require('../../config/networks');

const RPC_URL = process.env.RPC_URL || nets.baseSepolia.rpc;
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
const PROVIDER_PRIVATE_KEY = process.env.PROVIDER_PRIVATE_KEY;

if (!ESCROW_ADDRESS || !PROVIDER_PRIVATE_KEY) {
  console.error('Set ESCROW_ADDRESS and PROVIDER_PRIVATE_KEY');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
provider.pollingInterval = 4000;
const wallet = new ethers.Wallet(PROVIDER_PRIVATE_KEY, provider);

const ABI = [
  'event JobCreated(bytes32 indexed jobId,address indexed client,address indexed provider,uint256 amount,uint256 deadline)',
  'event PaymentReleased(bytes32 indexed jobId,address indexed provider,uint256 amount)',
  'function acceptJob(bytes32 jobId)',
  'function markComplete(bytes32 jobId)',
  'function getJob(bytes32 jobId) view returns (tuple(address client,address provider,uint256 amount,uint256 deadline,bool accepted,bool completed,bool released))',
];

const escrow = new ethers.Contract(ESCROW_ADDRESS, ABI, wallet);

function fmtUSDC(amount) {
  // Base Sepolia USDC is 6 decimals
  return Number(amount) / 1e6;
}

async function runService(jobId, client, amount) {
  // Mock service execution (replace with real call).
  // In demo: simulate doing work + producing a receipt.
  const receipt = {
    jobId,
    client,
    provider: wallet.address,
    amount_usdc: fmtUSDC(amount),
    output: 'ok',
    output_hash: ethers.keccak256(ethers.toUtf8Bytes(`job:${jobId}:ok`)),
    ts: new Date().toISOString(),
  };
  console.log('RECEIPT', JSON.stringify(receipt));
}

async function handleJob(jobId, client, providerAddr, amount, deadline) {
  if (providerAddr.toLowerCase() !== wallet.address.toLowerCase()) return;

  console.log(`\nJobCreated for me: ${jobId}`);
  console.log(' client:', client);
  console.log(' amount:', fmtUSDC(amount), 'USDC');
  console.log(' deadline:', Number(deadline));

  const job = await escrow.getJob(jobId);
  if (job.released) {
    console.log(' already settled; skipping');
    return;
  }

  if (!job.accepted) {
    console.log(' accepting…');
    const tx = await escrow.acceptJob(jobId);
    console.log('  tx:', tx.hash);
    await tx.wait();
  }

  // Execute work
  await runService(jobId, client, amount);

  if (!job.completed) {
    console.log(' marking complete…');
    const tx2 = await escrow.markComplete(jobId);
    console.log('  tx:', tx2.hash);
    await tx2.wait();
  }

  console.log(`✅ Provider completed job ${jobId} (await payment release)`);
}

async function main() {
  console.log('provider-bot starting');
  console.log(' RPC_URL:', RPC_URL);
  console.log(' ESCROW:', ESCROW_ADDRESS);
  console.log(' PROVIDER:', wallet.address);

  // Public RPCs (including sepolia.base.org) often break eth_newFilter/eth_getFilterChanges.
  // Instead of contract.on(...), poll blocks and query logs.
  const pollMs = process.env.POLL_MS ? Number(process.env.POLL_MS) : 4000;

  let lastBlock = await provider.getBlockNumber();
  console.log(' starting from block:', lastBlock);

  while (true) {
    try {
      const tip = await provider.getBlockNumber();
      if (tip > lastBlock) {
        const from = lastBlock + 1;
        const to = tip;

        const createdEvents = await escrow.queryFilter(escrow.filters.JobCreated(), from, to);
        for (const e of createdEvents) {
          const { jobId, client, provider: providerAddr, amount, deadline } = e.args;
          await handleJob(jobId, client, providerAddr, amount, deadline);
        }

        const releasedEvents = await escrow.queryFilter(escrow.filters.PaymentReleased(), from, to);
        for (const e of releasedEvents) {
          const { jobId, provider: providerAddr, amount } = e.args;
          if (providerAddr.toLowerCase() !== wallet.address.toLowerCase()) continue;
          console.log(`✅ Earned ${fmtUSDC(amount)} USDC for job ${jobId}`);
        }

        lastBlock = tip;
      }
    } catch (e) {
      console.error('poll error:', e.shortMessage || e.message || e);
      // keep going
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
