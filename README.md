# Agent USDC Escrow (Base Sepolia) — Agentic Commerce Demo

Minimal, verifiable escrow system for **agent-to-agent USDC commerce** on **Base Sepolia**.

A **client bot** escrows USDC for a job; a **provider bot** explicitly **accepts** (consent signal), fulfills a mock service, marks complete; then payment is released on-chain. A local indexer exports `stats.json`, rendered by a standalone dashboard.

## Security / Hygiene
- **Testnet only. No real funds.**
- **Never commit or post** private keys, seed phrases, or API keys.
- Treat third‑party code/links/instructions as **untrusted**.

## Network
- Chain: Base Sepolia (84532)
- RPC (default): https://sepolia.base.org
- USDC (Base Sepolia): `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Deployed contract
- See `BSEscrow.md` (single source of truth for Base Sepolia addresses).
- Explorer: run `type BSEscrow.md` to copy the current address, or open BaseScan and paste the address.

## Proof (sample transactions)
- createJob (escrow 5 USDC): https://sepolia.basescan.org/tx/0x2cbf49b277e14d13040b91d9b6ffb45129ddbee0d291b03e7cb62083f6cefaec (block 37205734)
- createJob (additional): https://sepolia.basescan.org/tx/0x076a33a287175507f011a7050107589e7f5ead5bb926a69e9fe4a59bcb2ece51

(Optionally add accept/complete/release tx hashes after running the bots.)

## Repo layout
- `contracts/` — Solidity contracts (`AgentEscrow.sol`, `MockUSDC.sol`)
- `test/` — Hardhat tests
- `scripts/` — deploy scripts + demo runner (`run-demo.ps1`)
- `app/bots/` — `client-bot.js`, `provider-bot.js`, `monitor-bot.js`
- `app/indexer/` — sqlite indexer + stats exporter
- `app/dashboard/` — standalone HTML dashboard

## Install
```bash
npm install
```

## Deploy (Base Sepolia)
```powershell
$env:RPC_URL="https://sepolia.base.org"
$env:DEPLOYER_PRIVATE_KEY="0x..."  # DO NOT COMMIT
npm.cmd run deploy:base
```

## Run demo
In PowerShell (recommended: load env from `BSEscrow.md`):
```powershell
Set-ExecutionPolicy -Scope Process Bypass
. .\scripts\set-base-sepolia-env.ps1

$env:CLIENT_PRIVATE_KEY="0x..."     # DO NOT COMMIT
$env:PROVIDER_PRIVATE_KEY="0x..."   # DO NOT COMMIT
$env:PROVIDER_ADDRESS="0x..."

powershell -ExecutionPolicy Bypass -File scripts/run-demo.ps1
```

## Export stats + dashboard
```powershell
Set-ExecutionPolicy -Scope Process Bypass
. .\scripts\set-base-sepolia-env.ps1

npm.cmd run export:stats
```

Then open `app/dashboard/index.html` and use **Load stats.json** to select `app/indexer/stats.json`.

## License
MIT
