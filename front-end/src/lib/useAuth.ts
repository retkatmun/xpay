import { usePrivy, useWallets } from '@privy-io/react-auth'

export function useAuth() {
  const { ready, authenticated, user, login, logout, exportWallet } = usePrivy()
  const { wallets } = useWallets()

  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy')
  const walletAddress = embeddedWallet?.address

  const userProfile = {
    email: user?.email?.address || user?.google?.email || null,
    name: user?.google?.name || user?.email?.address?.split('@')[0] || null,
    picture: (user?.google as { picture?: string } | null)?.picture || null,
    authMethod: user?.google ? 'google' : user?.email ? 'email' : user?.wallet ? 'wallet' : null,
  }

  return {
    ready,
    authenticated,
    user,
    userProfile,
    walletAddress,
    embeddedWallet,
    wallets,
    login,
    logout,
    exportWallet,
  }
}
