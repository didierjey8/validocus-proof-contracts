import { ethers, network } from 'hardhat';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * End-to-end example: hash a local file with SHA-256 and anchor the hash
 * on-chain by calling `register(documentHash, metadata)`.
 *
 * Usage:
 *   CONTRACT_ADDRESS=0x... FILE=./README.md \
 *     npm run script -- scripts/anchor-example.ts --network fuji
 *
 * After the tx confirms, the proof is queryable forever via:
 *   - verify(hash)              // returns (sender, timestamp, metadata)
 *   - exists(hash)
 *   - isValidocusVerified(hash) // true only if sender is whitelisted
 *
 * A hash can only be anchored ONCE globally. Re-anchoring the same file
 * will revert with AlreadyAnchored, and this script prints the existing
 * proof instead.
 */
async function main() {
  const address = (process.env.CONTRACT_ADDRESS ?? '').trim();
  const file = (process.env.FILE ?? './README.md').trim();

  if (!address) throw new Error('CONTRACT_ADDRESS env var is required');
  if (!ethers.isAddress(address)) throw new Error(`Invalid CONTRACT_ADDRESS: ${address}`);

  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const bytes = fs.readFileSync(abs);
  const sha256 = crypto.createHash('sha256').update(bytes).digest();
  const documentHash = '0x' + sha256.toString('hex');

  const metadata = JSON.stringify({
    fileName: path.basename(abs),
    sizeBytes: bytes.length,
    anchoredAt: new Date().toISOString(),
  });

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt('ValidocusProofRegistry', address, signer);

  console.log('────────────────────────────────────────────────────────────');
  console.log('Anchoring document');
  console.log('────────────────────────────────────────────────────────────');
  console.log('Network:         ', network.name);
  console.log('Contract:        ', address);
  console.log('Signer:          ', signer.address);
  console.log('File:            ', abs);
  console.log('Size (bytes):    ', bytes.length);
  console.log('SHA-256:         ', documentHash);
  console.log('Metadata:        ', metadata);
  console.log('────────────────────────────────────────────────────────────');

  if (await registry.exists(documentHash)) {
    const proof = await registry.verify(documentHash);
    console.log('Hash already anchored. Existing proof:');
    console.log('  sender:        ', proof.sender);
    console.log('  timestamp:     ', proof.timestamp.toString());
    console.log('  metadata:      ', proof.metadata);
    return;
  }

  const tx = await registry.register(documentHash, metadata);
  console.log('Tx hash:         ', tx.hash);
  const receipt = await tx.wait();
  console.log('Block:           ', receipt!.blockNumber);
  console.log('Gas used:        ', receipt!.gasUsed.toString());

  const proof = await registry.verify(documentHash);
  const verified = await registry.isValidocusVerified(documentHash);

  console.log('────────────────────────────────────────────────────────────');
  console.log('Proof stored on-chain:');
  console.log('  sender:            ', proof.sender);
  console.log('  timestamp:         ', proof.timestamp.toString());
  console.log('  metadata:          ', proof.metadata);
  console.log('  validocus-verified:', verified);
  console.log('────────────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
