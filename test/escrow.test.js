const { expect } = require('chai');
const { ethers } = require('hardhat');

// USDC uses 6 decimals typically
const ONE_USDC = 1_000_000n;

describe('AgentEscrow', function () {
  async function deploy() {
    const [client, provider, thirdParty] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    const usdc = await MockUSDC.deploy('Mock USDC', 'USDC', 6);
    await usdc.waitForDeployment();

    const AgentEscrow = await ethers.getContractFactory('AgentEscrow');
    const escrow = await AgentEscrow.deploy(await usdc.getAddress());
    await escrow.waitForDeployment();

    // Fund client
    await usdc.mint(client.address, 1000n * ONE_USDC);

    return { client, provider, thirdParty, usdc, escrow };
  }

  function jobId(clientAddr, providerAddr, nonce = 1) {
    return ethers.keccak256(
      ethers.solidityPacked(['address', 'address', 'uint256'], [clientAddr, providerAddr, nonce])
    );
  }

  it('happy path: create -> accept -> complete -> release (anyone)', async function () {
    const { client, provider, thirdParty, usdc, escrow } = await deploy();

    const id = jobId(client.address, provider.address, 1);
    const amount = 5n * ONE_USDC;

    await usdc.connect(client).approve(await escrow.getAddress(), amount);

    await expect(escrow.connect(client).createJob(id, provider.address, amount, 3600))
      .to.emit(escrow, 'JobCreated');

    await expect(escrow.connect(provider).acceptJob(id)).to.emit(escrow, 'JobAccepted');
    await expect(escrow.connect(provider).markComplete(id)).to.emit(escrow, 'JobCompleted');

    const balBefore = await usdc.balanceOf(provider.address);

    // third party releases
    await expect(escrow.connect(thirdParty).releasePayment(id))
      .to.emit(escrow, 'PaymentReleased')
      .withArgs(id, provider.address, amount);

    const balAfter = await usdc.balanceOf(provider.address);
    expect(balAfter - balBefore).to.equal(amount);

    const job = await escrow.getJob(id);
    expect(job.released).to.equal(true);
  });

  it('cannot mark complete before accept', async function () {
    const { client, provider, usdc, escrow } = await deploy();

    const id = jobId(client.address, provider.address, 2);
    const amount = 3n * ONE_USDC;

    await usdc.connect(client).approve(await escrow.getAddress(), amount);
    await escrow.connect(client).createJob(id, provider.address, amount, 3600);

    await expect(escrow.connect(provider).markComplete(id)).to.be.revertedWith('Not accepted');
  });

  it('refund after expiry if not completed', async function () {
    const { client, provider, usdc, escrow } = await deploy();

    const id = jobId(client.address, provider.address, 3);
    const amount = 7n * ONE_USDC;

    await usdc.connect(client).approve(await escrow.getAddress(), amount);
    await escrow.connect(client).createJob(id, provider.address, amount, 10);

    // Move time forward
    await ethers.provider.send('evm_increaseTime', [11]);
    await ethers.provider.send('evm_mine');

    const balBefore = await usdc.balanceOf(client.address);

    await expect(escrow.connect(provider).refundIfExpired(id))
      .to.emit(escrow, 'JobRefunded')
      .withArgs(id, client.address, amount);

    const balAfter = await usdc.balanceOf(client.address);
    expect(balAfter - balBefore).to.equal(amount);

    const job = await escrow.getJob(id);
    expect(job.released).to.equal(true);
  });

  it('cannot double release', async function () {
    const { client, provider, thirdParty, usdc, escrow } = await deploy();

    const id = jobId(client.address, provider.address, 4);
    const amount = 2n * ONE_USDC;

    await usdc.connect(client).approve(await escrow.getAddress(), amount);
    await escrow.connect(client).createJob(id, provider.address, amount, 3600);
    await escrow.connect(provider).acceptJob(id);
    await escrow.connect(provider).markComplete(id);

    await escrow.connect(thirdParty).releasePayment(id);
    await expect(escrow.connect(thirdParty).releasePayment(id)).to.be.revertedWith('Already settled');
  });
});
