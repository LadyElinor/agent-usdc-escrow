// export-stats.js
// Reads app/indexer/escrow.sqlite and writes app/indexer/stats.json
// Usage:
//   node app/indexer/export-stats.js

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'escrow.sqlite');
const OUT_PATH = process.env.OUT_PATH || path.join(__dirname, 'stats.json');
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || null;
const EXPLORER = process.env.EXPLORER || 'https://sepolia.basescan.org';

function nowIso() {
  return new Date().toISOString();
}

function fmtUSDC(usdcBaseUnits) {
  return Number(usdcBaseUnits) / 1e6;
}

function shortAddr(a) {
  if (!a) return '';
  return a.slice(0, 6) + '…' + a.slice(-4);
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('DB not found:', DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  const totals = {
    jobs_total: db.prepare('select count(*) as n from jobs').get().n,
    jobs_completed: db.prepare('select count(*) as n from jobs where completed=1').get().n,
    jobs_settled: db.prepare('select count(*) as n from jobs where released=1').get().n,
    jobs_refunded: db.prepare('select count(*) as n from jobs where completed=0 and released=1').get().n,
    volume_settled_usdc: db.prepare('select coalesce(sum(volume_settled_usdc),0) as v from agents').get().v,
    active_providers: db.prepare('select count(*) as n from agents where jobs_completed>0').get().n,
  };

  const successDenom = totals.jobs_completed + totals.jobs_refunded;
  const successRate = successDenom > 0 ? (totals.jobs_completed / successDenom) : null;

  const topProviders = db.prepare(`
    select address, jobs_completed, jobs_refunded, volume_settled_usdc
    from agents
    where jobs_completed>0
    order by jobs_completed desc, volume_settled_usdc desc
    limit 25
  `).all().map((r, idx) => {
    const denom = r.jobs_completed + r.jobs_refunded;
    const sr = denom > 0 ? (r.jobs_completed / denom) : null;
    return {
      rank: idx + 1,
      provider: r.address,
      provider_short: shortAddr(r.address),
      completed: r.jobs_completed,
      refunded: r.jobs_refunded,
      volume_usdc: fmtUSDC(r.volume_settled_usdc),
      success_rate: sr,
    };
  });

  const recent = db.prepare(`
    select job_id, client, provider, amount_usdc, deadline, accepted, completed, released, created_tx, accepted_tx, completed_tx, released_tx, refunded_tx
    from jobs
    order by rowid desc
    limit 50
  `).all().map((r) => {
    let status = 'pending';
    if (r.released && r.completed) status = 'released';
    else if (r.released && !r.completed) status = 'refunded';
    else if (r.completed && !r.released) status = 'completed';
    else if (r.accepted && !r.completed) status = 'accepted';

    const tx = r.released_tx || r.refunded_tx || r.completed_tx || r.accepted_tx || r.created_tx || null;

    return {
      job_id: r.job_id,
      job_short: r.job_id ? (r.job_id.slice(0, 8) + '…') : null,
      client: r.client,
      client_short: shortAddr(r.client),
      provider: r.provider,
      provider_short: shortAddr(r.provider),
      amount_usdc: fmtUSDC(r.amount_usdc),
      status,
      tx_hash: tx,
      tx_url: tx ? `${EXPLORER}/tx/${tx}` : null,
    };
  });

  const out = {
    generated_at: nowIso(),
    network: {
      name: 'baseSepolia',
      chain_id: 84532,
      explorer: EXPLORER,
      escrow_address: ESCROW_ADDRESS,
      escrow_url: (ESCROW_ADDRESS ? `${EXPLORER}/address/${ESCROW_ADDRESS}` : null),
      usdc_decimals: 6,
    },
    overview: {
      jobs_total: totals.jobs_total,
      jobs_completed: totals.jobs_completed,
      jobs_refunded: totals.jobs_refunded,
      active_providers: totals.active_providers,
      volume_settled_usdc: fmtUSDC(totals.volume_settled_usdc),
      success_rate: successRate,
    },
    top_providers: topProviders,
    recent_jobs: recent,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log('wrote:', OUT_PATH);
}

main();
