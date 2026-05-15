import {
  ProofRegistered,
  SignerAuthorized,
  SignerRevoked,
} from '../generated/ValidocusProofRegistry/ValidocusProofRegistry';
import { Proof, Signer } from '../generated/schema';

/**
 * Indexes a ProofRegistered event. Proofs are immutable: the contract
 * enforces one anchor per documentHash, so we never update an entity.
 */
export function handleProofRegistered(event: ProofRegistered): void {
  const id = event.params.documentHash.toHexString();
  const proof = new Proof(id);
  proof.documentHash = event.params.documentHash;
  proof.sender = event.params.sender;
  proof.timestamp = event.params.timestamp;
  proof.metadata = event.params.metadata;
  proof.blockNumber = event.block.number;
  proof.txHash = event.transaction.hash;
  proof.save();
}

export function handleSignerAuthorized(event: SignerAuthorized): void {
  const id = event.params.signer.toHexString();
  let signer = Signer.load(id);
  if (signer === null) {
    signer = new Signer(id);
  }
  signer.authorized = true;
  signer.authorizedAt = event.block.timestamp;
  signer.revokedAt = null;
  signer.save();
}

export function handleSignerRevoked(event: SignerRevoked): void {
  const id = event.params.signer.toHexString();
  let signer = Signer.load(id);
  if (signer === null) {
    signer = new Signer(id);
    signer.authorizedAt = null;
  }
  signer.authorized = false;
  signer.revokedAt = event.block.timestamp;
  signer.save();
}
