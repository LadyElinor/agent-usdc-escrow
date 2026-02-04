-- SQLite schema for agent-usdc-escrow indexer

CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount_usdc INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  released INTEGER NOT NULL DEFAULT 0,
  created_tx TEXT,
  accepted_tx TEXT,
  completed_tx TEXT,
  released_tx TEXT,
  refunded_tx TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS agents (
  address TEXT PRIMARY KEY,
  jobs_created INTEGER NOT NULL DEFAULT 0,
  jobs_accepted INTEGER NOT NULL DEFAULT 0,
  jobs_completed INTEGER NOT NULL DEFAULT 0,
  jobs_refunded INTEGER NOT NULL DEFAULT 0,
  volume_settled_usdc INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
