/**
 * BMONI Embedded API client for XPay.
 *
 * Docs: https://bkey.mintlify.app/api-reference/introduction
 * Sandbox base URL: https://embedded-dev.bmoni.com
 * Production base URL: https://embedded.bmoni.com
 *
 * ── Correct integration order (Nigeria NGN) ──────────────────────────────────
 *   1.  POST /v1/users                                  → bmoniUserId
 *   2.  POST /v1/users/:id/smart-wallets/owner-proof-challenges
 *   3.  POST /v1/users/:id/smart-wallets/create-managed  → smartWalletId
 *   4.  GET  /v1/users/:id/onboarding/status             (check if already active)
 *   5.  [KYC wizard — only if not active]
 *         GET  /v1/users/:id/kyc/options
 *         POST /v1/users/:id/kyc/documents/identification
 *         POST /v1/users/:id/kyc/documents/proof-of-address  (optional)
 *         PATCH /v1/users/:id/kyc
 *         GET  /v1/users/:id/kyc/readiness
 *   6.  POST /v1/users/:id/onboarding/start-nigeria     (BVN does verification)
 *         → issues NGN virtual bank account automatically
 *   7.  GET  /v1/users/:id/bank-accounts/deposit-accounts/NGN  → VBA
 *
 * NOTE: For Nigeria, POST /kyc/activate is NOT needed before start-nigeria.
 *       BVN verification happens inside start-nigeria itself.
 *       /kyc/activate (no body) is only needed if adding a second currency later.
 */

// ─── Config ──────────────────────────────────────────────────────────────────

// Always use the Vite proxy path (/bmoni) so requests go through the dev server
// which proxies to https://embedded-dev.bmoni.com and adds CORS headers.
// In production, Vercel rewrites /bmoni/:path* → https://embedded-dev.bmoni.com/:path*
const BMONI_BASE_URL = import.meta.env.DEV
  ? "/bmoni"
  : "/bmoni"

const BMONI_API_KEY =
  (import.meta.env.VITE_BMONI_API_KEY as string) ||
  "pk_a025cacbf33a_76fb864113f3540909de5b1da39cc146906e35b1c6d4d1e4"

// ─── Error ───────────────────────────────────────────────────────────────────

export class BmoniError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message?: string) {
    super(message ?? `BMONI ${status}: ${code}`)
    this.name = "BmoniError"
    this.status = status
    this.code = code
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function bmoniRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${BMONI_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "x-api-key": BMONI_API_KEY,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === "AbortError") {
      throw new BmoniError(408, "timeout", "Request timed out. Check your connection and try again.")
    }
    throw new BmoniError(0, "network_error", "Network error. Check your connection and try again.")
  }
  clearTimeout(timer)

  if (!res.ok) {
    let code = "server_error"
    let message: string | undefined
    try {
      const j = (await res.json()) as {
        error?: string; code?: string; message?: string | string[]
      }
      code = j.error ?? j.code ?? code
      message = Array.isArray(j.message) ? j.message[0] : j.message
    } catch { /* ignore */ }
    throw new BmoniError(res.status, code, message)
  }

  if (res.status === 204) return {} as T
  return res.json() as Promise<T>
}

const get   = <T>(path: string)                 => bmoniRequest<T>("GET",   path)
const post  = <T>(path: string, body: unknown)  => bmoniRequest<T>("POST",  path, body)
const patch = <T>(path: string, body: unknown)  => bmoniRequest<T>("PATCH", path, body)

// ─── Types ────────────────────────────────────────────────────────────────────

export type BmoniUser = {
  id: string           // internal partner-user id
  bmoniUserId: string  // ← use this as the userId path param everywhere
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  createdAt: string
  updatedAt: string
}

export type SmartWallet = {
  id: string
  address: string
  currency: string  // "CNGN" | "USDB" | "CADC" | "EURe" | "MEXe"
  chain: string
  status: string
}

export type OnboardingStatus = {
  // Each rail reports its own named status field
  anchorStatus:    string  // USD (Anchor)
  bridgeStatus:    string  // USD (Bridge)
  moneriumStatus:  string  // EUR
  paytrieStatus:   string  // Nigeria NGN ← the one we care about
  etherfuseStatus: string  // Mexico
  ghanaCardStatus: string  // Ghana
}

export type OwnerProofChallenge = {
  challengeId: string
  message: string   // EIP-191 plain-text message to sign
  expiresAt: string
}

export type BmoniBalance = {
  currency: string
  balance: string       // decimal string e.g. "100.00"
  walletAddress: string
}

export type BmoniBank = {
  name: string
  code: string  // CBN code
}

export type BmoniVerifyAccountResult =
  | { success: true; accountHolderName: string; accountNumber: string; bankCode: string }
  | { success: false; reason: string }

export type BmoniWithdrawalAccount = {
  id: string
  accountNumber: string
  bankCode: string
  bankName: string
  accountHolderName: string
}

export type BmoniProposal = {
  proposalId: string
  status: "PENDING_APPROVALS" | "PENDING_SIGNATURES" | "COMPLETED" | "FAILED" | "CANCELLED" | string
  quote?: { fromAmount?: string; toAmount?: string; currency?: string }
}

export type BmoniSignPayload = {
  payload: string  // EIP-712 hex string
  type: string     // "EIP-712" | "EIP-191"
}

export type BmoniVba = {
  id: string
  accountNumber: string
  bankName: string
  accountName: string
  currency: string
  bankCode?: string
  status?: string
  targetCurrency?: string
}

export type KycReadiness = {
  ready: boolean
  missing: string[]
}

export type BvnLookupResult = {
  bvn: string
  firstName: string
  lastName: string
  middleName: string | null
  dateOfBirth: string   // YYYY-MM-DD
  gender: string | null
  phoneNumber: string
  nin: string | null
}

// ─── 1. User Management ──────────────────────────────────────────────────────

/**
 * Find an existing BMONI user by email or phone by paginating GET /v1/users.
 * Used to recover when createBmoniUser returns 409 (phone/email already exists).
 */
export async function findBmoniUser(params: { email: string; phoneNumber?: string }): Promise<BmoniUser | null> {
  let page = 1
  const limit = 50
  while (true) {
    const res = await get<{ users: BmoniUser[]; total: number; page: number; limit: number }>(
      `/v1/users?page=${page}&limit=${limit}`,
    )
    // Prefer email match, fall back to phone match
    const match =
      res.users.find(u => u.email === params.email) ??
      (params.phoneNumber ? res.users.find(u => u.phoneNumber === params.phoneNumber) : undefined)
    if (match) return match
    // No more pages
    if (res.users.length < limit || page * limit >= res.total) return null
    page++
  }
}

/**
 * Create a BMONI user — or recover the existing one if 409 Conflict.
 *
 * IMPORTANT for sandbox: firstName/lastName/phoneNumber must match a test persona.
 *   Persona 1 — Bunch Dillon,  BVN 95888168924, phone +2348000000000
 *   Persona 2 — Samson Jabo,   BVN 22222222222, phone +2348000000001
 *
 * IMPORTANT: always create sandbox users as Bunch Dillon with phone +2348000000000.
 * Using Persona 1 means the only valid sandbox BVN to enter at KYC is 95888168924.
 */
export async function createBmoniUser(params: {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string  // E.164 e.g. "+2348000000000"
}): Promise<BmoniUser> {
  try {
    const res = await post<{ user: BmoniUser }>("/v1/users", params)
    return res.user
  } catch (err) {
    // 409 = user with this phone/email already exists — find and return them
    if (err instanceof BmoniError && err.status === 409) {
      const existing = await findBmoniUser({ email: params.email, phoneNumber: params.phoneNumber })
      if (existing) return existing
      // Phone is registered to a completely different account — user needs support
      throw new BmoniError(
        409,
        "phone_taken",
        "This phone number is already linked to a different account. Please contact support or sign up with a different phone number."
      )
    }
    throw err
  }
}

// ─── 2. Smart Wallet Provisioning ─────────────────────────────────────────────

/**
 * Step 1 of wallet creation: request an EIP-191 challenge message.
 * The address that signs it must match `userOwnerAddress` exactly.
 */
export async function requestOwnerProofChallenge(
  userId: string,
  userOwnerAddress: string,
  currency = "CNGN",
): Promise<OwnerProofChallenge> {
  return post<OwnerProofChallenge>(
    `/v1/users/${userId}/smart-wallets/owner-proof-challenges`,
    { currency, userOwnerAddress },
  )
}

/**
 * Step 2 of wallet creation: submit the signed challenge to create the managed wallet.
 */
export async function createManagedWallet(
  userId: string,
  params: {
    currency: string
    userOwnerAddress: string
    ownerProofChallengeId: string
    ownerProofSignature: string
  },
): Promise<SmartWallet> {
  return post<SmartWallet>(
    `/v1/users/${userId}/smart-wallets/create-managed`,
    params,
  )
}

// ─── 3. Onboarding Status ─────────────────────────────────────────────────────

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  return get<OnboardingStatus>(`/v1/users/${userId}/onboarding/status`)
}

// ─── 4. KYC ──────────────────────────────────────────────────────────────────

/**
 * Look up BVN details (fetch only — does not save or verify against profile).
 * Use this to pre-fill the KYC form. Sandbox: use BVN 95888168924 (Bunch Dillon).
 */
export async function lookupBvn(userId: string, bvn: string): Promise<BvnLookupResult> {
  return get<BvnLookupResult>(`/v1/users/${userId}/kyc/bvn-lookup/${bvn}`)
}

export async function uploadKycDocument(
  userId: string,
  type: "identification" | "proof-of-address" | "biometric",
  file: File,
  meta: Record<string, string> = {},
): Promise<{ documentId: string }> {
  const form = new FormData()
  form.append("file", file)
  for (const [k, v] of Object.entries(meta)) form.append(k, v)

  const res = await fetch(
    `${BMONI_BASE_URL}/v1/users/${userId}/kyc/documents/${type}`,
    {
      method: "POST",
      headers: { "x-api-key": BMONI_API_KEY },
      body: form,
    },
  )
  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as { error?: string }
    throw new BmoniError(res.status, j.error ?? "upload_failed")
  }
  return res.json()
}

/**
 * PATCH KYC profile — correct field names per the BMONI API spec.
 * For Nigeria: address.countryCode must be "NGA", postalCode required (6 digits).
 */
export async function patchKycProfile(
  userId: string,
  data: {
    personalInfo?: {
      firstName?: string
      lastName?: string
      dateOfBirth?: string  // YYYY-MM-DD
      gender?: string
      phoneNumber?: string  // E.164
    }
    address?: {
      streetLine1: string
      city: string
      state: string          // valid Nigerian state name
      postalCode: string     // 6 digits for Nigeria
      countryCode: string    // "NGA" for Nigeria
    }
    employment?: {
      employmentStatus?: string
      occupationCode?: string
      employerName?: string
    }
    sourceOfFunds?: string
    estimatedMonthlyVolume?: string
    accountPurpose?: string
    actingAsIntermediary?: boolean
    identificationNumbers?: Array<{
      type: string              // "bvn" | "nin"
      number: string            // the actual ID number
      issuingCountryCode: string // "NGA" for Nigeria
    }>
  },
): Promise<void> {
  await patch<void>(`/v1/users/${userId}/kyc`, data)
}

export async function getKycReadiness(userId: string): Promise<KycReadiness> {
  return get<KycReadiness>(`/v1/users/${userId}/kyc/readiness`)
}

/**
 * Activate KYC.
 * Nigeria + CAD: omit sumsubLevelName (pass empty body {}).
 * USD / EUR / MXN: pass sumsubLevelName = "id-and-liveness".
 * NOTE: For Nigeria NGN, this is NOT needed before start-nigeria.
 *       BVN verification inside start-nigeria handles identity.
 *       Only call this if adding a second currency (e.g. USD) later.
 */
export async function activateKyc(
  userId: string,
  sumsubLevelName?: string,
): Promise<void> {
  await post<void>(
    `/v1/users/${userId}/kyc/activate`,
    sumsubLevelName ? { sumsubLevelName } : {},
  )
}

// ─── 5. Nigeria Rail ──────────────────────────────────────────────────────────

/**
 * Start Nigeria onboarding — this is the call that:
 *  - Verifies the BVN against the profile
 *  - Issues the NGN virtual bank account
 *  - Activates the NGN rail
 *
 * IMPORTANT: The wallet address here must be the smart wallet's on-chain address
 * (from createManagedWallet), NOT the Privy EOA address.
 *
 * Sandbox BVN: 95888168924 (Bunch Dillon) — the only valid BVN when using Persona 1.
 * User must have been created with the matching persona name.
 */
export async function startNigeriaOnboarding(
  userId: string,
  bvn: string,
  ngnWalletAddress: string,
  ngnWalletIndex = 0,
): Promise<{ status: string }> {
  return post<{ status: string }>(
    `/v1/users/${userId}/onboarding/start-nigeria`,
    { bvn, ngnWalletAddress, ngnWalletIndex },
  )
}

// ─── 6. Balances ──────────────────────────────────────────────────────────────

export async function getBmoniBalances(userId: string): Promise<BmoniBalance[]> {
  const data = await get<{ balances: BmoniBalance[] }>(
    `/v1/users/${userId}/smart-wallets/account/balances`,
  )
  return data.balances ?? []
}

export async function getBmoniBalance(
  userId: string,
  currency = "CNGN",
): Promise<BmoniBalance | null> {
  const balances = await getBmoniBalances(userId)
  return balances.find(b => b.currency === currency) ?? null
}

// ─── 7. NGN Virtual Bank Account (deposits) ──────────────────────────────────

/**
 * Read the NGN VBA that was issued during start-nigeria.
 * Returns first account in the accounts array.
 */
export async function getNgnDepositAccount(userId: string): Promise<BmoniVba> {
  const data = await get<{ accounts: BmoniVba[] }>(
    `/v1/users/${userId}/bank-accounts/deposit-accounts/NGN`,
  )
  const account = (data.accounts ?? [])[0]
  if (!account) throw new BmoniError(404, "no_ngn_account", "No NGN deposit account found yet")
  return account
}

// ─── 8. Nigerian Banks (for withdrawals) ──────────────────────────────────────

export async function getNigerianBanks(userId: string): Promise<BmoniBank[]> {
  const data = await get<{ banks: { bankName: string; bankCode: string }[] }>(
    `/v1/users/${userId}/bank-accounts/nigerian-banks`,
  )
  // Normalise to { name, code } shape
  return (data.banks ?? []).map(b => ({ name: b.bankName ?? (b as unknown as BmoniBank).name, code: b.bankCode ?? (b as unknown as BmoniBank).code }))
}

// ─── 9. Verify Nigerian Bank Account ──────────────────────────────────────────

/**
 * Verify a Nigerian bank account and return the account holder name.
 *
 * SANDBOX NOTE: BMONI sandbox only accepts a small set of test account numbers.
 * Known working sandbox accounts:
 *   accountNumber: "0000000001"  bankCode: "000023"  → Ebuka Abubakar (Providus)
 *   accountNumber: "0001234567"  bankCode: "000013"  → Chinara Ohakwu (GTBank)
 *
 * For real accounts, verification will return E101. In sandbox this is expected —
 * the app shows a clear error message with the test account hint.
 */
export async function verifyNigerianAccount(
  userId: string,
  accountNumber: string,
  bankCode: string,
): Promise<BmoniVerifyAccountResult> {
  try {
    const data = await post<{ accountHolderName?: string; accountName?: string }>(
      `/v1/users/${userId}/bank-accounts/verify-nigerian-account`,
      { accountNumber, bankCode },
    )
    const name = data?.accountHolderName ?? data?.accountName ?? null
    if (name) {
      return { success: true, accountHolderName: name, accountNumber, bankCode }
    }
    return { success: false, reason: "invalid_account" }
  } catch (err) {
    if (err instanceof BmoniError) {
      // E101 = cannot verify — bad account number / bank code combination
      return { success: false, reason: err.code }
    }
    return { success: false, reason: "network_error" }
  }
}

// ─── 10. Register Withdrawal Account ──────────────────────────────────────────

export async function registerWithdrawalAccount(
  userId: string,
  params: {
    accountNumber: string
    bankCode: string
    bankName: string
    accountHolderName: string
  },
): Promise<BmoniWithdrawalAccount> {
  return post<BmoniWithdrawalAccount>(
    `/v1/users/${userId}/bank-accounts/withdrawal-accounts/nigeria`,
    params,
  )
}

// ─── 11. NGN Offramp (withdrawal) ─────────────────────────────────────────────

export async function createNgnOfframp(
  userId: string,
  smartWalletId: string,
  bankAccountId: string,
  fromAmount: string,
): Promise<BmoniProposal> {
  const data = await post<{ data: BmoniProposal }>(
    `/v1/users/${userId}/smart-wallets/${smartWalletId}/offramp/nigeria`,
    { bankAccountId, fromAmount },
  )
  return data.data
}

// ─── 12. Proposal signing ─────────────────────────────────────────────────────

export async function getProposalSignPayload(
  userId: string,
  proposalId: string,
): Promise<BmoniSignPayload> {
  return get<BmoniSignPayload>(
    `/v1/users/${userId}/smart-wallets/proposals/${proposalId}/sign-payload`,
  )
}

export async function submitProposalSignature(
  userId: string,
  proposalId: string,
  signature: string,
): Promise<BmoniProposal> {
  return post<BmoniProposal>(
    `/v1/users/${userId}/smart-wallets/proposals/${proposalId}/sign`,
    { signature },
  )
}

export async function getProposal(
  userId: string,
  proposalId: string,
): Promise<BmoniProposal> {
  return get<BmoniProposal>(
    `/v1/users/${userId}/smart-wallets/proposals/${proposalId}`,
  )
}

// ─── 13. User-to-user Transfer ────────────────────────────────────────────────

export async function createTransferProposal(
  userId: string,
  smartWalletId: string,
  params: {
    toUserId: string
    amount: string
    currency?: string
    memo?: string
  },
): Promise<BmoniProposal> {
  const data = await post<{ data: BmoniProposal }>(
    `/v1/users/${userId}/smart-wallets/${smartWalletId}/proposals`,
    {
      type: "TRANSFER",
      toUserId: params.toUserId,
      amount: params.amount,
      currency: params.currency ?? "CNGN",
      memo: params.memo,
    },
  )
  return data.data
}

// ─── 14. Poll proposal until terminal ─────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"])

export async function pollProposal(
  userId: string,
  proposalId: string,
  timeoutMs = 60_000,
  intervalMs = 3_000,
): Promise<BmoniProposal> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const p = await getProposal(userId, proposalId)
    if (TERMINAL_STATUSES.has(p.status)) return p
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new BmoniError(408, "proposal_timeout", "Proposal did not settle in time")
}

// ─── 15. Swap preview ─────────────────────────────────────────────────────────

export type BmoniSwapQuote = {
  fromCurrency: string
  toCurrency: string
  fromAmount: string
  toAmount: string
  rate: string
  fee: string
  expiresAt: string
}

export async function getBmoniSwapQuote(
  userId: string,
  fromCurrency: string,
  toCurrency: string,
  fromAmount: string,
): Promise<BmoniSwapQuote> {
  return post<BmoniSwapQuote>(
    `/v1/users/${userId}/exchange/convert`,
    { fromCurrency, toCurrency, fromAmount, preview: true },
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sign an EIP-191 message using a Privy embedded wallet provider.
 * `provider` = result of `embeddedWallet.getEthereumProvider()`.
 */
export async function signWithPrivy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  address: string,
  message: string,
): Promise<string> {
  const hexMessage = message.startsWith("0x")
    ? message
    : `0x${Array.from(new TextEncoder().encode(message))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")}`
  return provider.request({
    method: "personal_sign",
    params: [hexMessage, address],
  }) as Promise<string>
}

/**
 * Full smart-wallet provisioning handshake (steps 2–3 of integration flow):
 *   1. Request owner-proof challenge
 *   2. Sign with Privy embedded wallet
 *   3. Create managed wallet
 * Returns the SmartWallet — persist wallet.id as bmoni_wallet_id
 * and wallet.address as the ngnWalletAddress for start-nigeria.
 */
export async function provisionSmartWallet(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  privyProvider: any,
  ownerAddress: string,
  currency = "CNGN",
): Promise<SmartWallet> {
  const challenge = await requestOwnerProofChallenge(userId, ownerAddress, currency)
  const signature = await signWithPrivy(privyProvider, ownerAddress, challenge.message)
  return createManagedWallet(userId, {
    currency,
    userOwnerAddress: ownerAddress,
    ownerProofChallengeId: challenge.challengeId,
    ownerProofSignature: signature,
  })
}
