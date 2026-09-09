/**
 * ChainAdapter: the blockchain, as the rest of the backend sees it.
 * Production: BaseSepoliaChain
 * Tests only: MockChain
 */

export type TransferOutcome = {
  txHash: string
  confirmed: boolean
  chainId: number
  blockNumber?: number
}

/**
 * A USDC Transfer event detected by the deposit scanner.
 * The `to` address belongs to a known XPay user wallet.
 */
export type DepositEvent = {
  txHash: string
  fromAddress: string
  toAddress: string
  amount: bigint
  blockNumber: bigint
  chainId: number
}

export interface ChainAdapter {
  readonly kind: "mock" | "base_sepolia"
  readonly chainId: number

  /** USDC balance in base units (6 decimals). 1_000_000 = $1.00 */
  balanceOf(address: string): Promise<bigint>

  /** Transfer USDC. Treasury wallet signs. */
  transfer(params: {
    fromAddress: string
    toAddress: string
    amount: bigint
    confirmBudgetMs: number
  }): Promise<TransferOutcome>

  /**
   * Independently verify a txHash represents a valid USDC transfer
   * of at least expectedAmount to expectedTo.
   * Never trust the frontend's claimed hash/amount.
   */
  verifyTransfer(params: {
    txHash: string
    expectedTo: string
    expectedAmount: bigint
    requiredConfirmations?: number
  }): Promise<{
    valid: boolean
    confirmed: boolean
    confirmations: number
    blockNumber?: number
  }>

  /** mint() only works on mock — real USDC has a controlled supply. */
  mint(toAddress: string, amount: bigint): Promise<TransferOutcome>

  canReceive(address: string): boolean

  /**
   * Scan a block range for USDC Transfer events whose `to` address is in
   * the provided set of watched addresses.
   *
   * Returns one DepositEvent per matched log. The caller is responsible for
   * advancing the cursor after successfully processing the batch.
   */
  scanDeposits(params: {
    fromBlock: bigint
    toBlock: bigint
    watchedAddresses: Set<string>
  }): Promise<DepositEvent[]>

  /**
   * Return the current finalised (or latest) block number on this chain.
   * Used to initialise the scan cursor on first start.
   */
  currentBlock(): Promise<bigint>
}
