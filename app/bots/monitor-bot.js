#!/usr/bin/env node

// monitor-bot.js
// Reads the local sqlite indexer DB and prints a periodic marketplace status line.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'indexer', 'escrow.sqlite');
const INTERVAL_MS = process.env.INTERVAL_MS ? Number(process.env.INTERVAL_MS) : 30 * 60 * 1000;

const db = new Database(DB_PATH);

function getStats() {
  const jobs = db.prepare('select count(*) as n from jobs').get().n;
  const completed = db.prepare('select count(*) as n from jobs where completed=1 and released=1').get().n;
  const refunded = db.prepare('select count(*) as n from jobs where completed=0 and released=1').get().n;
  const vol = db.prepare('select coalesce(sum(volume_settled_usdc),0) as v from agents').get().v;
  const top = db.prepare('select address, jobs_completed, volume_settled_usdc from agents order by jobs_completed desc limit 3').all();
  return { jobs, completed, refunded, vol, top };
}

function fmtUSDC(usdcBaseUnits) {
  return (Number(usdcBaseUnits) / 1e6).toFixed(2);
}

function tick() {
  const s = getStats();
  console.log(`📊 Marketplace Update: jobs=${s.jobs} completed=${s.completed} refunded=${s.refunded} volume=${fmtUSDC(s.vol)} USDC`);
  for (const t of s.top) {
    console.log(`  - ${t.address} completed=${t.jobs_completed} volume=${fmtUSDC(t.volume_settled_usdc)} USDC`);
  }
}

console.log('monitor-bot DB:', DB_PATH);
tick();
setInterval(tick, INTERVAL_MS);
