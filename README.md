# ValidocusProofRegistry

> Public, permissionless on-chain notary for document SHA-256 proofs.
> Built for **Avalanche C-Chain** — open-source under MIT.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Solidity 0.8.24](https://img.shields.io/badge/Solidity-0.8.24-lightgrey.svg)](contracts/ValidocusProofRegistry.sol)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-yellow.svg)](https://hardhat.org)
[![OpenZeppelin Contracts 5.x](https://img.shields.io/badge/OpenZeppelin-5.x-3F51B5.svg)](https://docs.openzeppelin.com/contracts/5.x/)

## What it does

`ValidocusProofRegistry` is a minimal, immutable smart contract that lets
**any wallet** anchor a document's SHA-256 hash on-chain. The first wallet
to anchor a given hash wins — the proof is recorded forever with the
sender, a timestamp, and a small JSON metadata blob.

Verification is a single on-chain call: `verify(hash)` returns the proof
or an empty struct. **No backend involved.**

Validocus owns a whitelist of "official" wallets. When the anchor came
from a whitelisted wallet, the contract returns `isValidocusVerified(hash)
== true` and the UI renders a **"Verified by Validocus"** seal. All other
anchors stay on-chain and are valid timestamps — they just don't carry
the seal. That's it.

```
┌──────────────┐       register(hash, metadata)       ┌──────────────────────────┐
│ Any wallet   │ ───────────────────────────────────▶ │ ValidocusProofRegistry   │
└──────────────┘                                      │ (Avalanche C-Chain)      │
                                                      └────────────┬─────────────┘
                                                                   │ emits
                                                                   ▼
                                                           ProofRegistered
                                                                   │
                                                                   ▼
                              ┌─────────────────────────────────────────────────┐
                              │ Anyone verifies via:                            │
                              │   • verify(hash)       → eth_call, no wallet    │
                              │   • The Graph subgraph (analytics)              │
                              │   • a 60-line HTML page (no backend)            │
                              └─────────────────────────────────────────────────┘
```

## Why on-chain?

| Property            | Centralized timestamping     | This contract                              |
| ------------------- | ---------------------------- | ------------------------------------------ |
| Censorship          | Vendor can refuse a document | Anyone can anchor                          |
| Survival            | Vendor disappears → proofs gone | Proofs persist as long as the chain     |
| Verification        | Trust the vendor's API       | Trustless `eth_call` from any wallet/RPC   |
| Trust signal        | "Trust me bro"               | Cryptographic seal tied to a whitelist     |
| Tamper risk         | Database row can be edited   | Immutable; even the contract owner cannot mutate proofs |

## Key properties

- **Public + permissionless writes.** Anyone calls `register(hash, metadata)`.
- **One hash, one anchor, forever.** A SHA-256 hash is unique by definition;
  the contract enforces global uniqueness so verification is a single
  O(1) lookup with just the hash.
- **Validocus seal is a label, not a gate.** The owner adds/removes
  authorized wallets via `authorizeSigner` / `revokeSigner`. Only proofs
  whose sender is currently whitelisted satisfy `isValidocusVerified`.
- **Immutable proofs.** No update/delete paths. Revoking a signer does not
  alter their past proofs — only the seal goes away.
- **Emergency `pause()`.** Owner can pause new writes; reads always work.
- **Cheap.** ≈ 58k gas per `register()` (≈ \$0.0015 on Avalanche at typical fees).
- **Audit-friendly.** ≈ 250 lines of Solidity, OpenZeppelin-only deps.

## Repository layout

```
validocus-proof-contracts/
├── contracts/
│   └── ValidocusProofRegistry.sol      ← the contract
├── test/
│   └── ValidocusProofRegistry.test.ts  ← Hardhat + Chai (target 100% cov)
├── scripts/
│   ├── deploy.ts                       ← deploy to Fuji / Avalanche
│   ├── verify.ts                       ← Snowtrace verification helper
│   ├── transfer-ownership.ts           ← post-deploy ownership handoff
│   └── anchor-example.ts               ← CLI demo: anchor a local file
├── examples/
│   ├── frontend/index.html             ← drag-and-drop verifier (no backend)
│   ├── api/server.js                   ← minimal read-only Express API
│   └── indexer/                        ← The Graph subgraph scaffold
├── docs/
│   ├── ARCHITECTURE.md                 ← design rationale & trust model
│   ├── DEPLOYMENT.md                   ← step-by-step deploy + verify
│   └── INDEXING.md                     ← eth_call vs subgraph vs custom
├── hardhat.config.ts
├── package.json
└── .env.example
```

## Quickstart

```bash
git clone <repo>
cd validocus-proof-contracts
npm install
cp .env.example .env       # fill PRIVATE_KEY + SNOWTRACE_API_KEY

npm run compile
npm test                   # full unit suite
npm run test:coverage      # 100% line + branch coverage report

npm run deploy:fuji        # testnet
npm run deploy:avalanche   # mainnet
```

After deploy, open `examples/frontend/index.html` in any browser, paste
the contract address, drag a file in — you'll see the on-chain proof or
"not anchored". Zero backend involved.

## Public API surface

### Write

```solidity
function register(bytes32 documentHash, string calldata metadata) external;
```

Anyone can call. Reverts on `EmptyHash`, `MetadataTooLarge`,
`AlreadyAnchored` (the hash already has an anchor), or `EnforcedPause`.
Metadata is bounded to 1024 bytes.

### Read

```solidity
function verify(bytes32 hash)
  external view returns (Proof memory);
  // Proof = (address sender, uint64 timestamp, string metadata)

function exists(bytes32 hash) external view returns (bool);
function isValidocusVerified(bytes32 hash) external view returns (bool);
function authorizedSigners(address) external view returns (bool);
function authorizedSignerCount() external view returns (uint256);
function totalProofs() external view returns (uint256);
```

### Owner-only

```solidity
function authorizeSigner(address signer) external;
function revokeSigner(address signer) external;
function pause() external;
function unpause() external;
function transferOwnership(address newOwner) external;  // inherited from OZ Ownable
```

## Trust model in one sentence

Anyone can write; the owner can only manage the seal label (the
`authorizedSigners` whitelist) and pause new writes. The owner cannot
forge, edit, or delete user proofs.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full breakdown,
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the deploy runbook, and
[`docs/INDEXING.md`](docs/INDEXING.md) for read-side patterns.

## Roadmap

- v1 (this repo) — single-anchor-per-hash, authorized-signer seal,
  pause, ownership transfer.
- v2 (RFC) — batch `registerMany(...)` for cost amortization on
  high-volume anchoring days.
- v3 (RFC) — optional EIP-712 meta-transactions so end users can anchor
  through Validocus paying gas, without holding AVAX themselves.

## Audit status

**Not formally audited.** The contract is intentionally minimal (≈ 250 LOC
including comments, single-file, OpenZeppelin-only deps) to make community
review tractable. Independent reviews and PRs are welcome.

## License

MIT — see [`LICENSE`](LICENSE).
