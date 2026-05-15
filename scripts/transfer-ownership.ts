import { ethers, network } from 'hardhat';

/**
 * Transfers ownership of a deployed ValidocusProofRegistry to a new owner.
 *
 * Typical use case: the deployer (a hot wallet) hands the contract over to
 * a multi-sig or to the Validocus governance wallet after a successful
 * deploy.
 *
 * The signer that runs this script MUST be the current owner. Configure the
 * deployer's PRIVATE_KEY in `.env` so Hardhat uses it.
 *
 * Usage:
 *   CONTRACT_ADDRESS=0x... NEW_OWNER=0x... \
 *     npm run script -- scripts/transfer-ownership.ts --network fuji
 *
 *   CONTRACT_ADDRESS=0x... NEW_OWNER=0x... \
 *     npm run script -- scripts/transfer-ownership.ts --network avalanche
 */
async function main() {
  const address = (process.env.CONTRACT_ADDRESS ?? '').trim();
  const newOwner = (process.env.NEW_OWNER ?? '').trim();

  if (!address) throw new Error('CONTRACT_ADDRESS env var is required');
  if (!newOwner) throw new Error('NEW_OWNER env var is required');
  if (!ethers.isAddress(address)) throw new Error(`Invalid CONTRACT_ADDRESS: ${address}`);
  if (!ethers.isAddress(newOwner)) throw new Error(`Invalid NEW_OWNER: ${newOwner}`);

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt('ValidocusProofRegistry', address, signer);

  const currentOwner = await registry.owner();
  console.log('────────────────────────────────────────────────────────────');
  console.log('Transferring ownership');
  console.log('────────────────────────────────────────────────────────────');
  console.log('Network:        ', network.name);
  console.log('Contract:       ', address);
  console.log('Current owner:  ', currentOwner);
  console.log('Signer (you):   ', signer.address);
  console.log('New owner:      ', newOwner);
  console.log('────────────────────────────────────────────────────────────');

  if (currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer ${signer.address} is NOT the current owner (${currentOwner}). Aborting.`,
    );
  }

  if (newOwner.toLowerCase() === currentOwner.toLowerCase()) {
    console.log('New owner equals current owner — nothing to do.');
    return;
  }

  const tx = await registry.transferOwnership(newOwner);
  console.log('Tx hash:        ', tx.hash);
  await tx.wait();
  console.log('Confirmed.');

  const after = await registry.owner();
  console.log('Owner now:      ', after);
  console.log('────────────────────────────────────────────────────────────');

  if (after.toLowerCase() !== newOwner.toLowerCase()) {
    throw new Error('Owner mismatch after transfer. Investigate.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
