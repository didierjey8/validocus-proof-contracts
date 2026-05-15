import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import * as dotenv from 'dotenv';

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x' + '0'.repeat(64);
const SNOWTRACE_API_KEY = process.env.SNOWTRACE_API_KEY || '';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // balance between deployment cost and per-call cost
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    // Avalanche Fuji testnet — free AVAX via faucet
    // Faucet: https://faucet.avax.network/
    fuji: {
      url: 'https://api.avax-test.network/ext/bc/C/rpc',
      chainId: 43113,
      accounts: PRIVATE_KEY !== '0x' + '0'.repeat(64) ? [PRIVATE_KEY] : [],
    },
    // Avalanche C-Chain mainnet
    avalanche: {
      url: 'https://api.avax.network/ext/bc/C/rpc',
      chainId: 43114,
      accounts: PRIVATE_KEY !== '0x' + '0'.repeat(64) ? [PRIVATE_KEY] : [],
    },
    // ─── Optional EVM-compatible chains (uncomment to enable) ───────────────
    // Same contract bytecode is portable across all EVM L2s. To deploy on
    // Base / Optimism / Polygon later, uncomment the relevant block, run
    // `npm run deploy:<network>` and verify with the corresponding explorer.
    //
    // base: {
    //   url: 'https://mainnet.base.org',
    //   chainId: 8453,
    //   accounts: [PRIVATE_KEY],
    // },
    // baseSepolia: {
    //   url: 'https://sepolia.base.org',
    //   chainId: 84532,
    //   accounts: [PRIVATE_KEY],
    // },
    // optimism: {
    //   url: 'https://mainnet.optimism.io',
    //   chainId: 10,
    //   accounts: [PRIVATE_KEY],
    // },
    // polygon: {
    //   url: 'https://polygon-rpc.com',
    //   chainId: 137,
    //   accounts: [PRIVATE_KEY],
    // },
  },
  etherscan: {
    apiKey: {
      avalanche: SNOWTRACE_API_KEY,
      avalancheFujiTestnet: SNOWTRACE_API_KEY,
    },
    customChains: [
      {
        network: 'avalanche',
        chainId: 43114,
        urls: {
          apiURL: 'https://api.snowtrace.io/api',
          browserURL: 'https://snowtrace.io',
        },
      },
      {
        network: 'avalancheFujiTestnet',
        chainId: 43113,
        urls: {
          apiURL: 'https://api-testnet.snowtrace.io/api',
          browserURL: 'https://testnet.snowtrace.io',
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD',
    token: 'AVAX',
    gasPriceApi: 'https://api.snowtrace.io/api?module=proxy&action=eth_gasPrice',
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
