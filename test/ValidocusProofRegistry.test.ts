import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ValidocusProofRegistry } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

/**
 * Full unit-test suite for ValidocusProofRegistry.
 * Target: 100% line + branch coverage. Run with `npm run test:coverage`.
 */
describe('ValidocusProofRegistry', () => {
  let registry: ValidocusProofRegistry;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let validocusSigner: HardhatEthersSigner;

  const HASH_A = '0x' + 'a'.repeat(64);
  const HASH_B = '0x' + 'b'.repeat(64);
  const ZERO_HASH = '0x' + '0'.repeat(64);

  beforeEach(async () => {
    [owner, alice, bob, validocusSigner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('ValidocusProofRegistry');
    registry = (await Factory.deploy([validocusSigner.address])) as unknown as ValidocusProofRegistry;
    await registry.waitForDeployment();
  });

  // ──────────────────────────────────────────────────────────────────────
  describe('Deployment', () => {
    it('sets the deployer as owner', async () => {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it('pre-authorizes signers from constructor argument', async () => {
      expect(await registry.authorizedSigners(validocusSigner.address)).to.equal(true);
      expect(await registry.authorizedSignerCount()).to.equal(1n);
    });

    it('starts unpaused with zero totalProofs', async () => {
      expect(await registry.paused()).to.equal(false);
      expect(await registry.totalProofs()).to.equal(0n);
    });

    it('reverts if a constructor signer is zero address', async () => {
      const Factory = await ethers.getContractFactory('ValidocusProofRegistry');
      await expect(Factory.deploy([ethers.ZeroAddress])).to.be.revertedWithCustomError(
        Factory,
        'ZeroAddress',
      );
    });

    it('reverts if a constructor signer is duplicated in the same array', async () => {
      const Factory = await ethers.getContractFactory('ValidocusProofRegistry');
      await expect(
        Factory.deploy([validocusSigner.address, validocusSigner.address]),
      ).to.be.revertedWithCustomError(Factory, 'AlreadyAuthorized');
    });

    it('accepts empty initialSigners array', async () => {
      const Factory = await ethers.getContractFactory('ValidocusProofRegistry');
      const r = (await Factory.deploy([])) as unknown as ValidocusProofRegistry;
      expect(await r.authorizedSignerCount()).to.equal(0n);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  describe('register() — happy path', () => {
    it('stores proof, increments totalProofs, emits ProofRegistered', async () => {
      const meta = '{"soliId":"abc-001"}';
      const tx = await registry.connect(alice).register(HASH_A, meta);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(registry, 'ProofRegistered')
        .withArgs(HASH_A, alice.address, block!.timestamp, meta);

      const proof = await registry.verify(HASH_A);
      expect(proof.sender).to.equal(alice.address);
      expect(proof.timestamp).to.equal(BigInt(block!.timestamp));
      expect(proof.metadata).to.equal(meta);

      expect(await registry.totalProofs()).to.equal(1n);
      expect(await registry.exists(HASH_A)).to.equal(true);
    });

    it('accepts empty metadata', async () => {
      await expect(registry.connect(alice).register(HASH_A, ''))
        .to.emit(registry, 'ProofRegistered');
      const proof = await registry.verify(HASH_A);
      expect(proof.metadata).to.equal('');
    });

    it('allows SAME sender to anchor DIFFERENT hashes', async () => {
      await registry.connect(alice).register(HASH_A, 'doc 1');
      await registry.connect(alice).register(HASH_B, 'doc 2');

      expect((await registry.verify(HASH_A)).metadata).to.equal('doc 1');
      expect((await registry.verify(HASH_B)).metadata).to.equal('doc 2');
      expect(await registry.totalProofs()).to.equal(2n);
    });

    it('allows DIFFERENT senders to anchor DIFFERENT hashes', async () => {
      await registry.connect(alice).register(HASH_A, 'from alice');
      await registry.connect(bob).register(HASH_B, 'from bob');

      expect((await registry.verify(HASH_A)).sender).to.equal(alice.address);
      expect((await registry.verify(HASH_B)).sender).to.equal(bob.address);
    });

    it('accepts metadata of exactly MAX_METADATA_BYTES length', async () => {
      const max = Number(await registry.MAX_METADATA_BYTES());
      const meta = 'x'.repeat(max);
      await expect(registry.connect(alice).register(HASH_A, meta))
        .to.emit(registry, 'ProofRegistered');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  describe('register() — reverts', () => {
    it('reverts on empty hash (bytes32(0))', async () => {
      await expect(registry.connect(alice).register(ZERO_HASH, 'meta'))
        .to.be.revertedWithCustomError(registry, 'EmptyHash');
    });

    it('reverts on metadata > MAX_METADATA_BYTES', async () => {
      const max = Number(await registry.MAX_METADATA_BYTES());
      const tooLarge = 'x'.repeat(max + 1);
      await expect(registry.connect(alice).register(HASH_A, tooLarge))
        .to.be.revertedWithCustomError(registry, 'MetadataTooLarge')
        .withArgs(max + 1, max);
    });

    it('reverts when ANY sender tries to anchor an already-anchored hash', async () => {
      await registry.connect(alice).register(HASH_A, 'first');
      await expect(registry.connect(bob).register(HASH_A, 'second'))
        .to.be.revertedWithCustomError(registry, 'AlreadyAnchored');
      await expect(registry.connect(alice).register(HASH_A, 'third'))
        .to.be.revertedWithCustomError(registry, 'AlreadyAnchored');
    });

    it('reverts when paused', async () => {
      await registry.connect(owner).pause();
      await expect(registry.connect(alice).register(HASH_A, 'meta'))
        .to.be.revertedWithCustomError(registry, 'EnforcedPause');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  describe('verify() / exists()', () => {
    it('verify returns zero struct for missing hash', async () => {
      const proof = await registry.verify(HASH_A);
      expect(proof.sender).to.equal(ethers.ZeroAddress);
      expect(proof.timestamp).to.equal(0n);
      expect(proof.metadata).to.equal('');
    });

    it('exists returns false for missing hash, true after register', async () => {
      expect(await registry.exists(HASH_A)).to.equal(false);
      await registry.connect(alice).register(HASH_A, 'meta');
      expect(await registry.exists(HASH_A)).to.equal(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  describe('isValidocusVerified()', () => {
    it('returns false if hash is not anchored', async () => {
      expect(await registry.isValidocusVerified(HASH_A)).to.equal(false);
    });

    it('returns false if anchored by an unauthorized wallet', async () => {
      await registry.connect(alice).register(HASH_A, 'meta');
      expect(await registry.isValidocusVerified(HASH_A)).to.equal(false);
    });

    it('returns true when anchored by an authorized signer', async () => {
      await registry.connect(validocusSigner).register(HASH_A, 'official anchor');
      expect(await registry.isValidocusVerified(HASH_A)).to.equal(true);
    });

    it('returns false after the authorized signer is revoked', async () => {
      await registry.connect(validocusSigner).register(HASH_A, 'meta');
      expect(await registry.isValidocusVerified(HASH_A)).to.equal(true);
      await registry.connect(owner).revokeSigner(validocusSigner.address);
      expect(await registry.isValidocusVerified(HASH_A)).to.equal(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  describe('authorizeSigner() / revokeSigner()', () => {
    it('only owner can authorize', async () => {
      await expect(registry.connect(alice).authorizeSigner(bob.address))
        .to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
    });

    it('emits SignerAuthorized + updates state', async () => {
      await expect(registry.connect(owner).authorizeSigner(bob.address))
        .to.emit(registry, 'SignerAuthorized')
        .withArgs(bob.address);
      expect(await registry.authorizedSigners(bob.address)).to.equal(true);
      expect(await registry.authorizedSignerCount()).to.equal(2n);
    });

    it('reverts authorize on zero address', async () => {
      await expect(registry.connect(owner).authorizeSigner(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registry, 'ZeroAddress');
    });

    it('reverts authorize on already-authorized address', async () => {
      await expect(registry.connect(owner).authorizeSigner(validocusSigner.address))
        .to.be.revertedWithCustomError(registry, 'AlreadyAuthorized');
    });

    it('only owner can revoke', async () => {
      await expect(registry.connect(alice).revokeSigner(validocusSigner.address))
        .to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
    });

    it('emits SignerRevoked + updates state', async () => {
      await expect(registry.connect(owner).revokeSigner(validocusSigner.address))
        .to.emit(registry, 'SignerRevoked')
        .withArgs(validocusSigner.address);
      expect(await registry.authorizedSigners(validocusSigner.address)).to.equal(false);
      expect(await registry.authorizedSignerCount()).to.equal(0n);
    });

    it('reverts revoke on non-authorized address', async () => {
      await expect(registry.connect(owner).revokeSigner(alice.address))
        .to.be.revertedWithCustomError(registry, 'NotAuthorized');
    });

    it('existing proofs survive revocation (data immutable)', async () => {
      await registry.connect(validocusSigner).register(HASH_A, 'meta');
      await registry.connect(owner).revokeSigner(validocusSigner.address);
      const proof = await registry.verify(HASH_A);
      expect(proof.timestamp).to.be.greaterThan(0n);
      expect(proof.metadata).to.equal('meta');
      expect(proof.sender).to.equal(validocusSigner.address);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  describe('pause() / unpause()', () => {
    it('only owner can pause', async () => {
      await expect(registry.connect(alice).pause())
        .to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
    });

    it('only owner can unpause', async () => {
      await registry.connect(owner).pause();
      await expect(registry.connect(alice).unpause())
        .to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
    });

    it('reads work while paused', async () => {
      await registry.connect(alice).register(HASH_A, 'meta');
      await registry.connect(owner).pause();
      const proof = await registry.verify(HASH_A);
      expect(proof.metadata).to.equal('meta');
    });

    it('register resumes after unpause', async () => {
      await registry.connect(owner).pause();
      await registry.connect(owner).unpause();
      await expect(registry.connect(alice).register(HASH_A, 'meta'))
        .to.emit(registry, 'ProofRegistered');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  describe('Ownership transfer (Ownable)', () => {
    it('owner can transfer ownership', async () => {
      await registry.connect(owner).transferOwnership(alice.address);
      expect(await registry.owner()).to.equal(alice.address);
    });

    it('new owner can authorize signers', async () => {
      await registry.connect(owner).transferOwnership(alice.address);
      await expect(registry.connect(alice).authorizeSigner(bob.address))
        .to.emit(registry, 'SignerAuthorized');
    });

    it('old owner loses authority after transfer', async () => {
      await registry.connect(owner).transferOwnership(alice.address);
      await expect(registry.connect(owner).authorizeSigner(bob.address))
        .to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  describe('Gas snapshot', () => {
    it('register() costs less than 80k gas with small metadata', async () => {
      const tx = await registry.connect(alice).register(HASH_A, '{"soliId":"x"}');
      const receipt = await tx.wait();
      expect(receipt!.gasUsed).to.be.lessThan(80_000n);
    });
  });
});
