#!/usr/bin/env node

// client-bot.js
// Creates jobs, posts a local receipt, waits for completion, and releases payment.

const { ethers } = require('ethers');
const nets = require('../../config/networks');

const RPC_URL = process.env.RPC_URL || nets.baseSepolia.rpc;
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
const CLIENT_PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY;
const PROVIDER_ADDRESS = process.env.PROVIDER_ADDRESS;

if (!ESCROW_ADDRESS || !CLIENT_PRIVATE_KEY || !PROVIDER_ADDRESS) {
  console.error('Set ESCROW_ADDRESS, CLIENT_PRIVATE_KEY, PROVIDER_ADDRESS');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
provider.pollingInterval = 4000;
const wallet = new ethers.Wallet(CLIENT_PRIVATE_KEY, provider);

const USDC = nets.baseSepolia.usdc;

const ESCROW_ABI = [
  'event JobCompleted(bytes32 indexed jobId)',
  'function createJob(bytes32 jobId,address provider,uint256 amount,uint256 duration)',
  'function releasePayment(bytes32 jobId)',
  'function getJob(bytes32 jobId) view returns (tuple(address client,address provider,uint256 amount,uint256 deadline,bool accepted,bool completed,bool released))',
];

const ERC20_ABI = [
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);
const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);

function jobId(clientAddr, providerAddr, nonce) {
  return ethers.keccak256(
    ethers.solidityPacked(['address', 'address', 'uint256'], [clientAddr, providerAddr, BigInt(nonce)])
  );
}

function parseUSDC(s) {
  // 6 decimals
  return ethers.parseUnits(String(s), 6);
}

async function ensureApproval(amount) {
  const current = await usdc.allowance(wallet.address, ESCROW_ADDRESS);
  if (current >= amount) return;

  // Approve a large allowance once to avoid repeated approvals and race conditions.
  // (USDC is standard ERC20; Base Sepolia USDC uses 6 decimals.)
  const max = ethers.MaxUint256;
  const tx = await usdc.approve(ESCROW_ADDRESS, max);
  console.log('approve tx:', tx.hash);
  await tx.wait();

  // Defensive re-check (public RPCs can be flaky; this prevents "exceeds allowance" surprises).
  const after = await usdc.allowance(wallet.address, ESCROW_ADDRESS);
  if (after < amount) {
    throw new Error(`Approval did not stick (allowance=${after.toString()} < needed=${amount.toString()}). Try adding more ETH for gas and retry.`);
  }
}

async function waitForJobCompleted(id) {
  return new Promise((resolve) => {
    const handler = (jobIdEv) => {
      if (jobIdEv !== id) return;
      escrow.off('JobCompleted', handler);
      resolve();
    };
    escrow.on('JobCompleted', handler);
  });
}

async function main() {
  console.log('client-bot starting');
  console.log(' RPC_URL:', RPC_URL);
  console.log(' ESCROW:', ESCROW_ADDRESS);
  console.log(' CLIENT:', wallet.address);
  console.log(' PROVIDER:', PROVIDER_ADDRESS);

  const bal = await usdc.balanceOf(wallet.address);
  console.log('USDC balance:', ethers.formatUnits(bal, 6));

  const baseNonce = process.env.JOB_NONCE_START ? Number(process.env.JOB_NONCE_START) : Math.floor(Date.now() / 1000);
  const queue = [
    { input: 'https://example.com/a', price: '5.00', duration: 3600 },
    { input: 'https://example.com/b', price: '5.00', duration: 7200 },
    { input: 'https://example.com/c', price: '3.00', duration: 1800 },
  ];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];

    // Find a free nonce (avoid "Job exists" if rerun)
    let nonce = baseNonce + i;
    let id = jobId(wallet.address, PROVIDER_ADDRESS, nonce);
    for (let tries = 0; tries < 25; tries++) {
      const j = await escrow.getJob(id);
      if (j.client === ethers.ZeroAddress) break;
      nonce++;
      id = jobId(wallet.address, PROVIDER_ADDRESS, nonce);
    }

    const amount = parseUSDC(item.price);

    console.log(`\nCreating job ${id} for input=${item.input}`);
    await ensureApproval(amount);

    // Some RPCs are eventually-consistent on state reads; if you ever see
    // "transfer amount exceeds allowance", rerun after a few seconds.
    const tx = await escrow.createJob(id, PROVIDER_ADDRESS, amount, item.duration);
    console.log('createJob tx:', tx.hash);
    await tx.wait();

    console.log('REQUEST', JSON.stringify({
      kind: 'service-request',
      service: 'URL Summarizer',
      input: item.input,
      jobId: id,
      max_price_usdc: item.price,
      client_wallet: wallet.address,
      provider_wallet: PROVIDER_ADDRESS,
      deadline_s: item.duration,
      ts: new Date().toISOString(),
    }));

    console.log('waiting for JobCompleted…');
    await waitForJobCompleted(id);

    console.log('releasing payment…');
    const tx2 = await escrow.releasePayment(id);
    console.log('releasePayment tx:', tx2.hash);
    await tx2.wait();

    console.log(`✅ Job ${id} paid`);
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
