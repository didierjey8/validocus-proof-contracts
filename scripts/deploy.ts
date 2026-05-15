import { ethers, network, run } from 'hardhat';

/**
 * Deploys ValidocusProofRegistry to the selected network.
 *
 * Reads optional configuration from environment:
 *   - INITIAL_SIGNERS        Comma-separated wallet addresses to pre-authorize.
 *   - TRANSFER_OWNERSHIP_TO  If set, ownership is transferred to this address
 *                            after a successful deploy (recommended: multi-sig).
 *
 * Usage:
 *   npm run deploy:fuji
 *   npm run deploy:avalanche
 *
 * After deploy, run the printed `npx hardhat verify ...` command to publish
 * the source on Snowtrace.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log('────────────────────────────────────────────────────────────');
  console.log('Deploying ValidocusProofRegistry');
  console.log('────────────────────────────────────────────────────────────');
  console.log('Network:           ', network.name, `(chainId ${network.config.chainId})`);
  console.log('Deployer:          ', deployer.address);
  console.log('Deployer balance:  ', ethers.formatEther(balance), 'native');

  // ── Parse initial signers ─────────────────────────────────────────────
  const rawSigners = (process.env.INITIAL_SIGNERS ?? '').trim();
  const initialSigners = rawSigners.length
    ? rawSigners.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  for (const s of initialSigners) {
    if (!ethers.isAddress(s)) {
      throw new Error(`Invalid address in INITIAL_SIGNERS: "${s}"`);
    }
  }
  console.log('Initial signers:   ', initialSigners.length === 0 ? '(none)' : initialSigners);

  // ── Deploy ────────────────────────────────────────────────────────────
  const Factory = await ethers.getContractFactory('ValidocusProofRegistry');
  const contract = await Factory.deploy(initialSigners);
  const tx = contract.deploymentTransaction();
  console.log('Deploy tx hash:    ', tx?.hash);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deployBlock = tx ? (await tx.wait())!.blockNumber : 'n/a';

  console.log('────────────────────────────────────────────────────────────');
  console.log('Contract address:  ', address);
  console.log('Deploy block:      ', deployBlock);
  console.log('Owner:             ', await contract.owner());
  console.log('Signers count:     ', (await contract.authorizedSignerCount()).toString());
  console.log('────────────────────────────────────────────────────────────');

  // ── Optional ownership transfer ───────────────────────────────────────
  const transferTo = (process.env.TRANSFER_OWNERSHIP_TO ?? '').trim();
  if (transferTo) {
    if (!ethers.isAddress(transferTo)) {
      throw new Error(`Invalid TRANSFER_OWNERSHIP_TO: "${transferTo}"`);
    }
    console.log(`Transferring ownership to ${transferTo}...`);
    const txTransfer = await contract.transferOwnership(transferTo);
    await txTransfer.wait();
    console.log('New owner:         ', await contract.owner());
    console.log('────────────────────────────────────────────────────────────');
  } else {
    console.log('Ownership left with deployer. To transfer later, run:');
    console.log(`  npm run script -- scripts/transfer-ownership.ts --network ${network.name}`);
    console.log('────────────────────────────────────────────────────────────');
  }

  // ── Print verify command ──────────────────────────────────────────────
  const constructorArg = JSON.stringify(initialSigners);
  console.log('To verify on Snowtrace, run:');
  console.log(
    `  npx hardhat verify --network ${network.name} ${address} '${constructorArg}'`,
  );
  console.log('────────────────────────────────────────────────────────────');

  // ── Optional: auto-verify if SNOWTRACE_API_KEY is set and not local ───
  if (
    process.env.SNOWTRACE_API_KEY &&
    network.name !== 'hardhat' &&
    network.name !== 'localhost'
  ) {
    console.log('Waiting 30s for the explorer to index the contract...');
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      await run('verify:verify', {
        address,
        constructorArguments: [initialSigners],
      });
      console.log('Source verified on Snowtrace.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('already verified')) {
        console.log('Already verified.');
      } else {
        console.warn('Auto-verify failed (re-run manually with the command above):');
        console.warn(msg);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
