import { run, network } from 'hardhat';

/**
 * Verifies a deployed ValidocusProofRegistry on Snowtrace.
 *
 * The constructor argument (`initialSigners`) is taken from the env var
 * INITIAL_SIGNERS — it MUST match exactly what was used at deploy time,
 * otherwise verification will fail with a bytecode mismatch.
 *
 * Usage:
 *   CONTRACT_ADDRESS=0x... npm run script -- scripts/verify.ts --network fuji
 *   CONTRACT_ADDRESS=0x... npm run script -- scripts/verify.ts --network avalanche
 *
 * Or directly:
 *   npx hardhat verify --network fuji <ADDRESS> '["0xSigner1","0xSigner2"]'
 */
async function main() {
  const address = (process.env.CONTRACT_ADDRESS ?? '').trim();
  if (!address) {
    throw new Error('CONTRACT_ADDRESS env var is required');
  }

  const rawSigners = (process.env.INITIAL_SIGNERS ?? '').trim();
  const initialSigners = rawSigners.length
    ? rawSigners.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  console.log('Verifying contract on', network.name);
  console.log('Address:          ', address);
  console.log('Constructor arg:  ', JSON.stringify(initialSigners));

  try {
    await run('verify:verify', {
      address,
      constructorArguments: [initialSigners],
    });
    console.log('Verified successfully.');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('already verified')) {
      console.log('Already verified.');
      return;
    }
    throw e;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
