/**
 * BaseSepoliaChain — real USDC on Base Sepolia via viem.
 *
 * Architecture:
 *   - Treasury wallet signs USDC transfers on behalf of users
 *   - Backend independently verifies every txHash before advancing state
 *   - Never trusts frontend-supplied amounts
 *
 * USDC on Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
 * Chain ID: 84532
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  formatUnits,
  getContract,
  type Hash,
  type Address,
  type PublicClient,
  type WalletClient,
  type TransactionReceipt,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"
import type { ChainAdapter, DepositEvent, TransferOutcome } from "./adapter.js"
import { config } from "../config.js"
import { ipv4Fetch } from "../lib/ipv4Fetch.js"

const USDC_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
])

export class BaseSepoliaChain implements ChainAdapter {
  readonly kind = "base_sepolia" as const
  readonly chainId: number

  private readonly publicClient: PublicClient
  private readonly walletClient: WalletClient
  private readonly usdcAddress: Address
  private readonly treasuryAddress: Address
  private readonly account: ReturnType<typeof privateKeyToAccount>

  constructor() {
    this.chainId = config.BASE_CHAIN_ID

    // Validate the private key format
    const pk = config.BASE_PRIVATE_KEY
    const normalized = pk.startsWith("0x") ? pk : `0x${pk}`

    const account = privateKeyToAccount(normalized as `0x${string}`)
    this.treasuryAddress = account.address
    this.account = account

    this.usdcAddress = config.USDC_ADDRESS as Address

    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(config.BASE_RPC_URL, { fetchOptions: { cache: "no-store" }, fetch: ipv4Fetch }),
    }) as PublicClient

    this.walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(config.BASE_RPC_URL, { fetchOptions: { cache: "no-store" }, fetch: ipv4Fetch }),
    })
  }

  canReceive(address: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(address)
  }

  async balanceOf(address: string): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.usdcAddress,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [address as Address],
    }) as Promise<bigint>
  }

  async getEthBalance(address: string): Promise<bigint> {
    return this.publicClient.getBalance({ address: address as Address })
  }

  async transfer(params: {
    fromAddress: string
    toAddress: string
    amount: bigint
    confirmBudgetMs: number
  }): Promise<TransferOutcome> {
    const { toAddress, amount, confirmBudgetMs } = params

    if (!this.canReceive(toAddress)) {
      throw new Error(`${toAddress} is not a valid EVM address`)
    }
    if (amount <= 0n) throw new Error("transfer amount must be positive")

    // Verify treasury balance
    const balance = await this.balanceOf(this.treasuryAddress)
    if (balance < amount) {
      throw new InsufficientFunds(
        `Treasury USDC balance (${formatUnits(balance, 6)}) is less than required (${formatUnits(amount, 6)})`,
      )
    }

    // Check gas balance
    const ethBalance = await this.getEthBalance(this.treasuryAddress)
    if (ethBalance < 1_000_000_000_000_000n) {
      // < 0.001 ETH
      throw new InsufficientGas(
        `Treasury ETH balance too low for gas: ${formatUnits(ethBalance, 18)} ETH`,
      )
    }

    const hash = await this.walletClient.writeContract({
      address: this.usdcAddress,
      abi: USDC_ABI,
      functionName: "transfer",
      args: [toAddress as Address, amount],
      chain: baseSepolia,
      account: this.account,
    })

    // Wait for confirmation within budget
    const receipt = await this.waitForReceipt(hash, confirmBudgetMs)

    if (!receipt) {
      return { txHash: hash, confirmed: false, chainId: this.chainId }
    }

    if (receipt.status === "reverted") {
      throw new Error(`USDC transfer reverted on-chain. txHash: ${hash}`)
    }

    return {
      txHash: hash,
      confirmed: true,
      chainId: this.chainId,
      blockNumber: Number(receipt.blockNumber),
    }
  }

  async verifyTransfer(params: {
    txHash: string
    expectedTo: string
    expectedAmount: bigint
    requiredConfirmations?: number
  }): Promise<{ valid: boolean; confirmed: boolean; confirmations: number; blockNumber?: number }> {
    const { txHash, expectedTo, expectedAmount, requiredConfirmations = config.REQUIRED_CONFIRMATIONS } = params

    let receipt: TransactionReceipt | null = null
    try {
      receipt = await this.publicClient.getTransactionReceipt({ hash: txHash as Hash })
    } catch {
      return { valid: false, confirmed: false, confirmations: 0 }
    }

    if (!receipt) return { valid: false, confirmed: false, confirmations: 0 }
    if (receipt.status === "reverted") return { valid: false, confirmed: false, confirmations: 0 }

    // Parse Transfer events from the receipt
    const transferEvents = receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === this.usdcAddress.toLowerCase() &&
        log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    )

    if (transferEvents.length === 0) {
      return { valid: false, confirmed: false, confirmations: 0 }
    }

    // Verify the transfer is to the expected recipient with the expected amount
    const isValid = transferEvents.some((log) => {
      if (log.topics.length < 3) return false
      const to = `0x${log.topics[2]!.slice(26)}`.toLowerCase()
      const amount = log.data !== "0x" ? BigInt(log.data) : 0n
      return (
        to === expectedTo.toLowerCase() && amount >= expectedAmount // at least the expected amount
      )
    })

    if (!isValid) return { valid: false, confirmed: false, confirmations: 0 }

    // Check confirmation count
    const currentBlock = await this.publicClient.getBlockNumber()
    const confirmations = Number(currentBlock - receipt.blockNumber)

    return {
      valid: true,
      confirmed: confirmations >= requiredConfirmations,
      confirmations,
      blockNumber: Number(receipt.blockNumber),
    }
  }

  /** Mint is not available on mainnet USDC — this throws intentionally. */
  async mint(_toAddress: string, _amount: bigint): Promise<TransferOutcome> {
    throw new Error(
      "mint() is not available on Base Sepolia with the official USDC contract. " +
        "Obtain testnet USDC from https://faucet.circle.com",
    )
  }

  async currentBlock(): Promise<bigint> {
    return this.publicClient.getBlockNumber()
  }

  /**
   * Scan a range of blocks for USDC Transfer events whose recipient is in
   * the watched set.  Uses eth_getLogs — one RPC call per window, no
   * subscription needed, works with any HTTP RPC endpoint.
   *
   * Block range must not exceed ~2000 blocks; the caller (DepositScanner)
   * is responsible for chunking.
   */
  async scanDeposits(params: {
    fromBlock: bigint
    toBlock: bigint
    watchedAddresses: Set<string>
  }): Promise<DepositEvent[]> {
    const { fromBlock, toBlock, watchedAddresses } = params

    // ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as `0x${string}`

    const logs = await this.publicClient.getLogs({
      address: this.usdcAddress,
      event: {
        type: "event",
        name: "Transfer",
        inputs: [
          { name: "from", type: "address", indexed: true },
          { name: "to", type: "address", indexed: true },
          { name: "value", type: "uint256", indexed: false },
        ],
      },
      fromBlock,
      toBlock,
    })

    const events: DepositEvent[] = []

    for (const log of logs) {
      // topics: [eventSig, from, to]
      if (!log.topics[2]) continue

      const toAddr = `0x${log.topics[2].slice(26)}`.toLowerCase()
      if (!watchedAddresses.has(toAddr)) continue

      const fromAddr = log.topics[1] ? `0x${log.topics[1].slice(26)}`.toLowerCase() : "0x"
      const amount = log.data !== "0x" ? BigInt(log.data) : 0n
      if (amount === 0n) continue

      events.push({
        txHash: log.transactionHash ?? "",
        fromAddress: fromAddr,
        toAddress: toAddr,
        amount,
        blockNumber: log.blockNumber ?? toBlock,
        chainId: this.chainId,
      })
    }

    return events
  }

  private async waitForReceipt(hash: Hash, budgetMs: number): Promise<TransactionReceipt | null> {
    const deadline = Date.now() + budgetMs
    const pollInterval = 2_000

    while (Date.now() < deadline) {
      try {
        const receipt = await this.publicClient.getTransactionReceipt({ hash })
        if (receipt) return receipt
      } catch {
        // Not yet mined
      }
      await new Promise((r) => setTimeout(r, pollInterval))
    }

    return null
  }

  /** Verify the connected RPC actually serves Base Sepolia. */
  async validateNetwork(): Promise<void> {
    const chainId = await this.publicClient.getChainId()
    if (chainId !== this.chainId) {
      throw new Error(
        `RPC chain ID mismatch: expected ${this.chainId} (Base Sepolia) but got ${chainId}. ` +
          `Check BASE_RPC_URL in your .env`,
      )
    }
  }

  get treasuryWalletAddress(): string {
    return this.treasuryAddress
  }
}

export class InsufficientFunds extends Error {
  constructor(message = "Insufficient USDC balance") {
    super(message)
    this.name = "InsufficientFunds"
  }
}

export class InsufficientGas extends Error {
  constructor(message = "Insufficient ETH for gas") {
    super(message)
    this.name = "InsufficientGas"
  }
}
