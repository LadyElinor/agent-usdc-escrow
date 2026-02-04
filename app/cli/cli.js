#!/usr/bin/env node

const { ethers } = require('ethers');

function usage() {
  console.log(`
Usage:
  node app/cli/cli.js jobid <client> <provider> <nonce>

JobId derivation (v0.1):
  keccak256( pack(client, provider, nonce) )

Example:
  node app/cli/cli.js jobid 0xClient 0xProvider 12
`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd !== 'jobid' || args.length !== 3) {
    usage();
    process.exit(1);
  }

  const [client, provider, nonceStr] = args;
  const nonce = BigInt(nonceStr);

  const id = ethers.keccak256(
    ethers.solidityPacked(['address','address','uint256'], [client, provider, nonce])
  );

  console.log(id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
