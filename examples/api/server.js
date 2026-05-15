/*
 * Minimal verification API.
 *
 * Read-only Express server that exposes the ValidocusProofRegistry contract
 * via JSON HTTP. Useful when a downstream application cannot speak Ethereum
 * RPC directly (mobile clients, legacy backends, etc.).
 *
 * Endpoints
 * ─────────
 *   GET  /verify/:hash    → proof + Validocus seal (one call, no wallet needed)
 *   GET  /health          → liveness
 *
 * Configuration (env)
 * ───────────────────
 *   PORT                 default 3000
 *   NETWORK              "fuji" (default) | "avalanche"
 *   CONTRACT_ADDRESS     deployed registry address (required)
 *   RPC_URL              optional override of the public RPC endpoint
 *
 * Install
 * ───────
 *   npm i express ethers
 *
 * Run
 * ───
 *   CONTRACT_ADDRESS=0x... NETWORK=fuji node server.js
 */

const express = require('express');
const { JsonRpcProvider, Contract, isHexString } = require('ethers');

const PORT = Number(process.env.PORT || 3000);
const NETWORK = (process.env.NETWORK || 'fuji').toLowerCase();
const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS || '').trim();

const RPC_DEFAULTS = {
  fuji:      'https://api.avax-test.network/ext/bc/C/rpc',
  avalanche: 'https://api.avax.network/ext/bc/C/rpc',
};
const RPC_URL = (process.env.RPC_URL || RPC_DEFAULTS[NETWORK] || '').trim();

if (!CONTRACT_ADDRESS) {
  console.error('CONTRACT_ADDRESS env var is required.');
  process.exit(1);
}
if (!RPC_URL) {
  console.error(`No RPC URL for NETWORK="${NETWORK}". Set RPC_URL explicitly.`);
  process.exit(1);
}

const ABI = [
  'function verify(bytes32) view returns (tuple(address sender, uint64 timestamp, string metadata))',
  'function exists(bytes32) view returns (bool)',
  'function isValidocusVerified(bytes32) view returns (bool)',
  'function totalProofs() view returns (uint256)',
];

const provider = new JsonRpcProvider(RPC_URL);
const registry = new Contract(CONTRACT_ADDRESS, ABI, provider);

function isHash32(s) {
  return typeof s === 'string' && isHexString(s, 32);
}

const app = express();
app.disable('x-powered-by');

app.get('/health', async (_req, res) => {
  try {
    const total = await registry.totalProofs();
    res.json({ ok: true, network: NETWORK, contract: CONTRACT_ADDRESS, totalProofs: total.toString() });
  } catch (err) {
    res.status(502).json({ ok: false, error: 'rpc_error', message: err.message });
  }
});

app.get('/verify/:hash', async (req, res) => {
  const { hash } = req.params;
  if (!isHash32(hash)) {
    return res.status(400).json({ error: 'invalid_hash', message: 'Expected 0x + 64 hex chars (SHA-256).' });
  }
  try {
    const [proof, validocusVerified] = await Promise.all([
      registry.verify(hash),
      registry.isValidocusVerified(hash),
    ]);
    const anchored = proof.timestamp !== 0n;
    res.json({
      network: NETWORK,
      contract: CONTRACT_ADDRESS,
      hash,
      anchored,
      sender: anchored ? proof.sender : null,
      anchoredAt: anchored ? new Date(Number(proof.timestamp) * 1000).toISOString() : null,
      metadata: anchored ? proof.metadata : null,
      validocusVerified,
    });
  } catch (err) {
    res.status(502).json({ error: 'rpc_error', message: err.message });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

app.listen(PORT, () => {
  console.log(`validocus-proof-api listening on :${PORT} — network=${NETWORK} contract=${CONTRACT_ADDRESS}`);
});
