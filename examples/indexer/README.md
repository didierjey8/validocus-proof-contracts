# The Graph subgraph — ValidocusProofRegistry

Indexes `ProofRegistered`, `SignerAuthorized`, and `SignerRevoked` events
into queryable GraphQL entities, so downstream apps can scan all anchors
without hitting Avalanche RPCs directly.

## When you need this

For single-document verification (`verify(hash)`) you do NOT need a
subgraph — a direct `eth_call` is enough. Use a subgraph when you need
**feeds and analytics** like:

- Latest 100 anchors by Validocus
- Total anchors per day / per month
- All anchors that lost their seal after a signer was revoked
- Search by metadata content

## Setup

```bash
npm i -g @graphprotocol/graph-cli
graph init --product hosted-service \
  --from-contract 0xYOUR_DEPLOYED_ADDRESS \
  --network avalanche \
  --abi ../../artifacts/contracts/ValidocusProofRegistry.sol/ValidocusProofRegistry.json \
  --contract-name ValidocusProofRegistry \
  validocus/proof-registry
```

Copy the files in this directory over the generated scaffold:

- `subgraph.yaml` — manifest (set `address` and `startBlock` to your deploy).
- `schema.graphql` — GraphQL entities.
- `src/mapping.ts` — event handlers.

Then:

```bash
graph codegen
graph build
graph deploy --product hosted-service <YOUR_GITHUB>/validocus-proof-registry
```

## Example queries

```graphql
# Latest 10 proofs
query {
  proofs(orderBy: timestamp, orderDirection: desc, first: 10) {
    id
    sender
    timestamp
    metadata
  }
}

# Proofs anchored by a specific wallet
query proofsByWallet($wallet: Bytes!) {
  proofs(where: { sender: $wallet }, orderBy: timestamp, orderDirection: desc) {
    documentHash
    timestamp
    metadata
    txHash
  }
}

# Single hash lookup (alternative to eth_call)
query proof($hash: ID!) {
  proof(id: $hash) {
    sender
    timestamp
    metadata
  }
}
```
