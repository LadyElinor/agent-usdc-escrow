$ErrorActionPreference = 'Stop'

# Demo orchestrator (Windows PowerShell)
# Requires env vars:
#   RPC_URL (optional; defaults to https://sepolia.base.org)
#   ESCROW_ADDRESS
#   CLIENT_PRIVATE_KEY
#   PROVIDER_PRIVATE_KEY
#   PROVIDER_ADDRESS

function Require-Env([string]$name) {
  $val = [Environment]::GetEnvironmentVariable($name, 'Process')
  if (-not $val -or $val.Trim().Length -eq 0) {
    throw "Missing required env var: $name"
  }
}

# Ensure required env vars are present in *this* shell
Require-Env "ESCROW_ADDRESS"
Require-Env "CLIENT_PRIVATE_KEY"
Require-Env "PROVIDER_PRIVATE_KEY"
Require-Env "PROVIDER_ADDRESS"
if (-not $env:RPC_URL -or $env:RPC_URL.Trim().Length -eq 0) {
  $env:RPC_URL = "https://sepolia.base.org"
}

# Pass a clean env block to child processes (Start-Process does not reliably inherit)
function Trim-Env([string]$v) {
  if ($null -eq $v) { return $null }
  return $v.Trim()
}

$childEnv = @{
  "RPC_URL" = (Trim-Env $env:RPC_URL)
  "ESCROW_ADDRESS" = (Trim-Env $env:ESCROW_ADDRESS)
  "CLIENT_PRIVATE_KEY" = (Trim-Env $env:CLIENT_PRIVATE_KEY)
  "PROVIDER_PRIVATE_KEY" = (Trim-Env $env:PROVIDER_PRIVATE_KEY)
  "PROVIDER_ADDRESS" = (Trim-Env $env:PROVIDER_ADDRESS)
}

# Use cmd-safe quoting to avoid trailing spaces/newlines breaking keys.
$envPrefix = ($childEnv.GetEnumerator() | ForEach-Object {
  'set "{0}={1}"' -f $_.Key, $_.Value
}) -join " & "

Write-Host "Starting indexer..."
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c", "$envPrefix & node app\\indexer\\indexer.js" | Out-Null

Start-Sleep -Seconds 2

Write-Host "Starting provider-bot..."
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c", "$envPrefix & node app\\bots\\provider-bot.js" | Out-Null

Start-Sleep -Seconds 2

Write-Host "Starting client-bot..."
# Run client in the foreground so you see errors/tx hashes
cmd.exe /c "$envPrefix & node app\\bots\\client-bot.js"

Write-Host "Done. (Indexer/provider continue running in background processes.)"
