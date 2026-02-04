const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { ethers } = require('ethers');

// Minimal event indexer for AgentEscrow.
// Configure via env:
//   RPC_URL
//   ESCROW_ADDRESS
//   START_BLOCK (optional)

const RPC_URL = process.env.RPC_URL;
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
const START_BLOCK = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;

if (!RPC_URL || !ESCROW_ADDRESS) {
  console.error('Set RPC_URL and ESCROW_ADDRESS');
  process.exit(1);
}

const dbPath = path.join(__dirname, 'escrow.sqlite');
const db = new Database(dbPath);

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const ABI = [
  'event JobCreated(bytes32 indexed jobId,address indexed client,address indexed provider,uint256 amount,uint256 deadline)',
  'event JobAccepted(bytes32 indexed jobId)',
  'event JobCompleted(bytes32 indexed jobId)',
  'event PaymentReleased(bytes32 indexed jobId,address indexed provider,uint256 amount)',
  'event JobRefunded(bytes32 indexed jobId,address indexed client,uint256 amount)',
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
provider.pollingInterval = 4000;
const escrow = new ethers.Contract(ESCROW_ADDRESS, ABI, provider);

const upsertAgent = db.prepare(`
INSERT INTO agents(address, updated_at) VALUES (?, unixepoch())
ON CONFLICT(address) DO UPDATE SET updated_at=unixepoch();
`);

const incAgent = (field) => db.prepare(`
INSERT INTO agents(address, ${field}, updated_at) VALUES (?, 1, unixepoch())
ON CONFLICT(address) DO UPDATE SET ${field}=${field}+1, updated_at=unixepoch();
`);

const addVolume = db.prepare(`
INSERT INTO agents(address, volume_settled_usdc, updated_at) VALUES (?, ?, unixepoch())
ON CONFLICT(address) DO UPDATE SET volume_settled_usdc=volume_settled_usdc+excluded.volume_settled_usdc, updated_at=unixepoch();
`);

const incCreated = incAgent('jobs_created');
const incAccepted = incAgent('jobs_accepted');
const incCompleted = incAgent('jobs_completed');
const incRefunded = incAgent('jobs_refunded');

const putJob = db.prepare(`
INSERT INTO jobs(job_id, client, provider, amount_usdc, deadline, created_tx)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(job_id) DO NOTHING;
`);

const setJob = (col) => db.prepare(`UPDATE jobs SET ${col}=1, ${col}_tx=? WHERE job_id=?;`);
const setAccepted = setJob('accepted');
const setCompleted = setJob('completed');
const setReleased = setJob('released');

function hexId(x) { return typeof x === 'string' ? x : String(x); }

async function backfill() {
  if (!START_BLOCK) return;

  console.log('Backfilling from block', START_BLOCK);

  const created = await escrow.queryFilter(escrow.filters.JobCreated(), START_BLOCK);
  for (const e of created) {
    const { jobId, client, provider, amount, deadline } = e.args;
    putJob.run(hexId(jobId), client, provider, Number(amount), Number(deadline), e.transactionHash);
    upsertAgent.run(client);
    upsertAgent.run(provider);
    incCreated.run(client);
  }

  const accepted = await escrow.queryFilter(escrow.filters.JobAccepted(), START_BLOCK);
  for (const e of accepted) {
    const { jobId } = e.args;
    setAccepted.run(e.transactionHash, hexId(jobId));
  }

  const completed = await escrow.queryFilter(escrow.filters.JobCompleted(), START_BLOCK);
  for (const e of completed) {
    const { jobId } = e.args;
    setCompleted.run(e.transactionHash, hexId(jobId));
  }

  const released = await escrow.queryFilter(escrow.filters.PaymentReleased(), START_BLOCK);
  for (const e of released) {
    const { jobId, provider, amount } = e.args;
    setReleased.run(e.transactionHash, hexId(jobId));
    incCompleted.run(provider);
    addVolume.run(provider, Number(amount));
  }

  const refunded = await escrow.queryFilter(escrow.filters.JobRefunded(), START_BLOCK);
  for (const e of refunded) {
    const { jobId, client, amount } = e.args;
    // treat refunded as settled (released=1) but counted separately
    setReleased.run(e.transactionHash, hexId(jobId));
    incRefunded.run(client);
  }

  console.log('Backfill done. db:', dbPath);
}

async function live() {
  console.log('Listening…', { ESCROW_ADDRESS, dbPath });

  // Public RPCs often break eth_newFilter/eth_getFilterChanges. Use block polling + queryFilter.
  const pollMs = process.env.POLL_MS ? Number(process.env.POLL_MS) : 4000;
  let lastBlock = await provider.getBlockNumber();
  console.log('starting from block', lastBlock);

  while (true) {
    try {
      const tip = await provider.getBlockNumber();
      if (tip > lastBlock) {
        const from = lastBlock + 1;
        const to = tip;

        const created = await escrow.queryFilter(escrow.filters.JobCreated(), from, to);
        for (const e of created) {
          const { jobId, client, provider: providerAddr, amount, deadline } = e.args;
          putJob.run(hexId(jobId), client, providerAddr, Number(amount), Number(deadline), e.transactionHash);
          upsertAgent.run(client);
          upsertAgent.run(providerAddr);
          incCreated.run(client);
        }

        const accepted = await escrow.queryFilter(escrow.filters.JobAccepted(), from, to);
        for (const e of accepted) {
          const { jobId } = e.args;
          setAccepted.run(e.transactionHash, hexId(jobId));
        }

        const completed = await escrow.queryFilter(escrow.filters.JobCompleted(), from, to);
        for (const e of completed) {
          const { jobId } = e.args;
          setCompleted.run(e.transactionHash, hexId(jobId));
        }

        const released = await escrow.queryFilter(escrow.filters.PaymentReleased(), from, to);
        for (const e of released) {
          const { jobId, provider: providerAddr, amount } = e.args;
          setReleased.run(e.transactionHash, hexId(jobId));
          incCompleted.run(providerAddr);
          addVolume.run(providerAddr, Number(amount));
        }

        const refunded = await escrow.queryFilter(escrow.filters.JobRefunded(), from, to);
        for (const e of refunded) {
          const { jobId, client, amount } = e.args;
          setReleased.run(e.transactionHash, hexId(jobId));
          incRefunded.run(client);
        }

        lastBlock = tip;
      }
    } catch (e) {
      console.error('poll error:', e.shortMessage || e.message || e);
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}

(async () => {
  await backfill();
  await live();
})();
