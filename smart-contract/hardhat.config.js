require('@nomicfoundation/hardhat-toolbox')

const dotenv = require('dotenv')
dotenv.config()

/**
 * XPay Hardhat config.
 *
 * Primary target: Base Sepolia (chain ID 84532).
 * Also supports local hardhat node for fast unit tests.
 */
module.exports = {
  defaultNetwork: 'hardhat',

  networks: {
    hardhat: {
      chainId: 31337,
    },

    base_sepolia: {
      url: process.env.RPC_URL || 'https://sepolia.base.org',
      accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
      chainId: 84532,
    },
  },

  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 1000 },
      evmVersion: 'paris',
    },
  },

  paths: {
    sources: './contracts',
    cache: './cache',
    artifacts: './artifacts',
  },

  mocha: { timeout: 40000 },
}
