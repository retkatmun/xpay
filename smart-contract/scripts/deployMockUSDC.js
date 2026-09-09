const { ethers } = require('hardhat')

/**
 * Deploy MockUSDC to Base Sepolia.
 *
 * Usage:
 *   npx hardhat run scripts/deployMockUSDC.js --network base_sepolia
 *
 * After deploying, set MOCK_USDC_ADDRESS in .env and in the backend .env.
 */
async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('Deploying with:', deployer.address)
  console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'ETH')

  const MockUSDC = await ethers.getContractFactory('MockUSDC')
  const usdc = await MockUSDC.deploy()
  await usdc.waitForDeployment()

  const address = await usdc.getAddress()
  console.log('MockUSDC deployed to:', address)
  console.log('')
  console.log('Add to backend .env:')
  console.log(`USDC_ADDRESS="${address}"`)
  console.log('')
  console.log('Mint some test USDC:')
  console.log(`  npx hardhat run scripts/mint.js --network base_sepolia`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
