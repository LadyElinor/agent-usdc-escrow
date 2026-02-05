param(
  [switch]$PrintOnly,
  [string]$BSEscrowPath = (Resolve-Path (Join-Path $PSScriptRoot '..\BSEscrow.md')).Path,
  [string]$RpcUrl = 'https://sepolia.base.org',
  [string]$Explorer = 'https://sepolia.basescan.org',
  [string]$Usdc = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
)

# Usage:
#   .\scripts\set-base-sepolia-env.ps1 -PrintOnly
#   . .\scripts\set-base-sepolia-env.ps1   # dot-source to set env vars in current shell

if (!(Test-Path $BSEscrowPath)) {
  throw "BSEscrow.md not found: $BSEscrowPath"
}

$txt = Get-Content -Raw -Path $BSEscrowPath
$m = [regex]::Match($txt, '0x[0-9a-fA-F]{40}')
if (!$m.Success) {
  throw "No 0x..40hex address found in $BSEscrowPath"
}

$escrow = $m.Value

$lines = @(
  "`$env:RPC_URL=`"$RpcUrl`"",
  "`$env:EXPLORER=`"$Explorer`"",
  "`$env:USDC_ADDRESS=`"$Usdc`"",
  "`$env:ESCROW_ADDRESS=`"$escrow`""
)

if ($PrintOnly) {
  $lines -join "`n"
  exit 0
}

$env:RPC_URL = $RpcUrl
$env:EXPLORER = $Explorer
$env:USDC_ADDRESS = $Usdc
$env:ESCROW_ADDRESS = $escrow

Write-Host "Set env for Base Sepolia:" -ForegroundColor Cyan
Write-Host "  RPC_URL=$env:RPC_URL"
Write-Host "  EXPLORER=$env:EXPLORER"
Write-Host "  USDC_ADDRESS=$env:USDC_ADDRESS"
Write-Host "  ESCROW_ADDRESS=$env:ESCROW_ADDRESS" -ForegroundColor Green
