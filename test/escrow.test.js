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

  it('cannot release before accept/complete', async function () {
    const { client, provider, thirdParty, usdc, escrow } = await deploy();

    const id = jobId(client.address, provider.address, 5);
    const amount = 4n * ONE_USDC;

    await usdc.connect(client).approve(await escrow.getAddress(), amount);
    await escrow.connect(client).createJob(id, provider.address, amount, 3600);

    // Not accepted or completed yet
    await expect(escrow.connect(thirdParty).releasePayment(id)).to.be.revertedWith('Not completed');

    await escrow.connect(provider).acceptJob(id);
    await expect(escrow.connect(thirdParty).releasePayment(id)).to.be.revertedWith('Not completed');
  });

  it('cannot complete after refund settlement', async function () {
    const { client, provider, usdc, escrow } = await deploy();

    const id = jobId(client.address, provider.address, 6);
    const amount = 6n * ONE_USDC;

    await usdc.connect(client).approve(await escrow.getAddress(), amount);
    await escrow.connect(client).createJob(id, provider.address, amount, 10);

    await ethers.provider.send('evm_increaseTime', [11]);
    await ethers.provider.send('evm_mine');

    await escrow.connect(provider).refundIfExpired(id);

    await expect(escrow.connect(provider).acceptJob(id)).to.be.revertedWith('Already settled');
    await expect(escrow.connect(provider).markComplete(id)).to.be.revertedWith('Already settled');
  });

  it('cannot refund after completion', async function () {
    const { client, provider, thirdParty, usdc, escrow } = await deploy();

    const id = jobId(client.address, provider.address, 7);
    const amount = 8n * ONE_USDC;

    await usdc.connect(client).approve(await escrow.getAddress(), amount);
    await escrow.connect(client).createJob(id, provider.address, amount, 10);

    await escrow.connect(provider).acceptJob(id);
    await escrow.connect(provider).markComplete(id);

    await ethers.provider.send('evm_increaseTime', [11]);
    await ethers.provider.send('evm_mine');

    await expect(escrow.connect(thirdParty).refundIfExpired(id)).to.be.revertedWith('Already completed');
  });

  it('createJob input validation: provider, amount, duration', async function () {
    const { client, provider, usdc, escrow } = await deploy();

    const amount = 1n * ONE_USDC;
    await usdc.connect(client).approve(await escrow.getAddress(), 1000n * ONE_USDC);

    const id1 = jobId(client.address, provider.address, 8);
    await expect(escrow.connect(client).createJob(id1, ethers.ZeroAddress, amount, 3600))
      .to.be.revertedWith('Invalid provider');

    const id2 = jobId(client.address, provider.address, 9);
    await expect(escrow.connect(client).createJob(id2, provider.address, 0, 3600))
      .to.be.revertedWith('Invalid amount');

    const id3 = jobId(client.address, provider.address, 10);
    await expect(escrow.connect(client).createJob(id3, provider.address, amount, 0))
      .to.be.revertedWith('Invalid duration');
  });

  it('conservation: escrow balance returns to 0 after settlement (per job)', async function () {
    const { client, provider, thirdParty, usdc, escrow } = await deploy();

    const id = jobId(client.address, provider.address, 11);
    const amount = 9n * ONE_USDC;

    await usdc.connect(client).approve(await escrow.getAddress(), amount);

    const escrowAddr = await escrow.getAddress();
    const esc0 = await usdc.balanceOf(escrowAddr);

    await escrow.connect(client).createJob(id, provider.address, amount, 3600);

    const esc1 = await usdc.balanceOf(escrowAddr);
    expect(esc1 - esc0).to.equal(amount);

    await escrow.connect(provider).acceptJob(id);
    await escrow.connect(provider).markComplete(id);

    await escrow.connect(thirdParty).releasePayment(id);

    const esc2 = await usdc.balanceOf(escrowAddr);
    expect(esc2).to.equal(esc0);
  });
});
