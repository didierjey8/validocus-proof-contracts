// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ValidocusProofRegistry
 * @author Validocus
 * @notice Public, permissionless on-chain notary for document SHA-256 proofs.
 *
 *         ANYONE can register a proof by calling `register(hash, metadata)`.
 *         A hash can only be registered ONCE globally — the first anchor
 *         wins. The contract stores (sender, timestamp, metadata) and emits
 *         a `ProofRegistered` event that any third party can index without
 *         depending on Validocus servers.
 *
 *         The contract maintains an optional `authorizedSigners` whitelist
 *         managed by the owner. This list does NOT restrict who can write —
 *         it only marks which wallets are considered "Validocus official"
 *         when the helper `isValidocusVerified(hash)` is called by
 *         downstream applications.
 *
 *         Design rationale:
 *           - PUBLIC writes preserve the censorship-resistance promise of
 *             blockchain notarization. Validocus does not gatekeep what
 *             gets anchored.
 *           - One hash → one anchor: the SHA-256 of a document is, by
 *             definition, unique. Re-anchoring the same hash adds no
 *             information; we revert to make front-end verification a
 *             simple O(1) lookup `verify(hash)` without an indexer.
 *           - The authorized-signers list lets the Validocus product UI
 *             show a "Verified by Validocus" seal when the anchor came
 *             from a Validocus-controlled wallet, while still allowing
 *             anyone else to anchor freely without the seal.
 *
 * @dev Compiled with solc 0.8.24, optimizer runs=200, viaIR enabled.
 *      Gas: ~58,000 per `register()` call on Avalanche C-Chain (≈ $0.0015
 *      at 25 gwei + AVAX $30).
 *
 *      Audit status: NOT formally audited. Use at your own risk.
 *      Open-source under MIT — community review welcome.
 */
contract ValidocusProofRegistry is Ownable, Pausable {
    // ─────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Maximum metadata string length in bytes. Keeps gas predictable.
    ///         Larger payloads should be stored off-chain (IPFS/S3) with a
    ///         CID or URL referenced inside `metadata`.
    uint256 public constant MAX_METADATA_BYTES = 256;

    // ─────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice A single proof entry for a documentHash.
     * @param sender    The wallet that anchored the hash (first writer wins).
     * @param timestamp Block timestamp when the proof was registered.
     *                  uint64 supports dates up to year ~584 billion AD.
     *                  Packs into the same slot as `sender`.
     * @param metadata  Application-specific data (typically JSON), bounded
     *                  to MAX_METADATA_BYTES bytes. Empty string allowed.
     */
    struct Proof {
        address sender;
        uint64 timestamp;
        string metadata;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────

    /// @notice documentHash => Proof. One global anchor per hash.
    mapping(bytes32 => Proof) private _proofs;

    /// @notice Wallets considered "Validocus official". Anyone can register,
    ///         but only proofs whose sender is on this list pass
    ///         `isValidocusVerified`.
    mapping(address => bool) public authorizedSigners;

    /// @notice Total number of authorized signers (for off-chain stats).
    uint256 public authorizedSignerCount;

    /// @notice Total number of proofs ever registered (for off-chain stats
    ///         and explorer-style dashboards).
    uint256 public totalProofs;

    // ─────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted on every successful proof registration.
     * @param documentHash Indexed: queryable by hash via eth_getLogs.
     * @param sender       Indexed: queryable by anchorer wallet.
     * @param timestamp    Block timestamp when anchored.
     * @param metadata     Application-specific payload (not indexed: too large).
     */
    event ProofRegistered(
        bytes32 indexed documentHash,
        address indexed sender,
        uint64 timestamp,
        string metadata
    );

    /// @notice Emitted when the owner authorizes a new Validocus signer.
    event SignerAuthorized(address indexed signer);

    /// @notice Emitted when the owner revokes a Validocus signer.
    event SignerRevoked(address indexed signer);

    // ─────────────────────────────────────────────────────────────────────
    // Errors (cheaper than require strings)
    // ─────────────────────────────────────────────────────────────────────

    error EmptyHash();
    error MetadataTooLarge(uint256 length, uint256 max);
    error AlreadyAnchored(bytes32 documentHash, address originalSender, uint64 originalTimestamp);
    error ZeroAddress();
    error AlreadyAuthorized(address signer);
    error NotAuthorized(address signer);

    // ─────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Deploys the registry, sets msg.sender as initial owner, and
     *         optionally pre-authorizes a list of Validocus signers.
     * @param initialSigners Optional list of wallets to mark as authorized
     *                       at deploy time. Use empty array `[]` to start
     *                       with no authorized signers.
     */
    constructor(address[] memory initialSigners) Ownable(msg.sender) {
        uint256 len = initialSigners.length;
        for (uint256 i = 0; i < len; i++) {
            address signer = initialSigners[i];
            if (signer == address(0)) revert ZeroAddress();
            if (authorizedSigners[signer]) revert AlreadyAuthorized(signer);
            authorizedSigners[signer] = true;
            emit SignerAuthorized(signer);
        }
        authorizedSignerCount = len;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Public write — anyone can call (subject to whenNotPaused)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Register a document proof. Permissionless: any wallet can call.
     *
     * @dev Reverts if:
     *      - `documentHash` is bytes32(0)
     *      - `metadata` exceeds MAX_METADATA_BYTES
     *      - this hash has already been anchored by ANY wallet (first-write-wins)
     *      - the contract is paused
     *
     * @param documentHash SHA-256 of the document (32 bytes).
     * @param metadata     Optional application-specific data (bounded).
     */
    function register(bytes32 documentHash, string calldata metadata)
        external
        whenNotPaused
    {
        if (documentHash == bytes32(0)) revert EmptyHash();
        if (bytes(metadata).length > MAX_METADATA_BYTES) {
            revert MetadataTooLarge(bytes(metadata).length, MAX_METADATA_BYTES);
        }

        Proof storage existing = _proofs[documentHash];
        if (existing.timestamp != 0) {
            revert AlreadyAnchored(documentHash, existing.sender, existing.timestamp);
        }

        uint64 ts = uint64(block.timestamp);
        _proofs[documentHash] = Proof({
            sender: msg.sender,
            timestamp: ts,
            metadata: metadata
        });
        unchecked {
            totalProofs += 1;
        }

        emit ProofRegistered(documentHash, msg.sender, ts, metadata);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Public read — anyone can call (works even when paused)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the proof entry for a given hash.
     *         `timestamp == 0` means no proof exists for that hash.
     */
    function verify(bytes32 documentHash)
        external
        view
        returns (Proof memory)
    {
        return _proofs[documentHash];
    }

    /**
     * @notice Convenience: returns true if a proof exists for a given hash,
     *         regardless of who anchored it.
     */
    function exists(bytes32 documentHash) external view returns (bool) {
        return _proofs[documentHash].timestamp != 0;
    }

    /**
     * @notice Returns true if a proof exists for `documentHash` AND its
     *         sender is currently an authorized Validocus signer.
     *
     *         This is the helper Validocus front-ends should use to display
     *         a "Verified by Validocus" seal. Other anchors remain valid
     *         on-chain — they just don't carry the Validocus trust signal.
     */
    function isValidocusVerified(bytes32 documentHash)
        external
        view
        returns (bool)
    {
        Proof storage p = _proofs[documentHash];
        return p.timestamp != 0 && authorizedSigners[p.sender];
    }

    // ─────────────────────────────────────────────────────────────────────
    // Owner-only — signer authorization
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Adds a wallet to the authorized signers list.
     * @dev Reverts on zero address or already authorized.
     */
    function authorizeSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        if (authorizedSigners[signer]) revert AlreadyAuthorized(signer);
        authorizedSigners[signer] = true;
        unchecked {
            authorizedSignerCount += 1;
        }
        emit SignerAuthorized(signer);
    }

    /**
     * @notice Removes a wallet from the authorized signers list.
     * @dev Reverts if the signer was not authorized to begin with.
     *      Existing proofs remain valid on-chain — only the trust signal
     *      from `isValidocusVerified` is affected going forward.
     */
    function revokeSigner(address signer) external onlyOwner {
        if (!authorizedSigners[signer]) revert NotAuthorized(signer);
        authorizedSigners[signer] = false;
        unchecked {
            authorizedSignerCount -= 1;
        }
        emit SignerRevoked(signer);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Owner-only — emergency controls
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Pauses new registrations. Reads remain available.
     *         Intended for emergency scenarios (vulnerability discovered,
     *         abuse from spam writes, governance lockup).
     */
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes registrations after a pause.
    function unpause() external onlyOwner {
        _unpause();
    }
}
