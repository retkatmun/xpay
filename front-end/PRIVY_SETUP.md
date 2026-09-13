# 🔐 Privy Authentication Setup Guide

## ✅ Implementation Complete

Your XPay frontend now has **Privy authentication** with:
- ✅ Email sign-up (passwordless)
- ✅ Google OAuth sign-up
- ✅ Wallet connection (MetaMask, Coinbase, etc.)
- ✅ Embedded wallets on Base mainnet
- ✅ USDC balance tracking
- ✅ User profile with Google picture
- ✅ Non-custodial wallet management

## 🚀 Quick Start

### 1. Get Your Privy Credentials

1. Go to [Privy Dashboard](https://dashboard.privy.io)
2. Create a new app or use existing
3. Copy your **App ID** and **App Secret**

### 2. Configure Environment Variables

Edit `/front-end/.env`:

```bash
# Backend API
VITE_API_URL=http://localhost:4000

# Privy Authentication
VITE_PRIVY_APP_ID=your-actual-app-id-here
VITE_PRIVY_APP_SECRET=your-actual-app-secret-here
```

**⚠️ IMPORTANT:** Replace `your-actual-app-id-here` with your real Privy App ID!

### 3. Install Dependencies

```bash
cd front-end
npm install
```

This installs:
- `@privy-io/react-auth` - Privy React SDK
- `@privy-io/wagmi` - Wallet integration
- `@tanstack/react-query` - Data fetching
- `viem` - Ethereum utilities
- `wagmi` - Wallet hooks

### 4. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:5173`

## 🎯 User Flow

### Authentication Flow
```
Landing Page (/) 
    ↓ Click "Get Started"
Login Page (/login)
    ↓ Choose: Email | Google | Wallet
Privy Modal (Email/Google/Wallet)
    ↓ After authentication
Wallet Page (/wallet)
    ✓ View profile
    ✓ See USDC balance on Base
    ✓ View wallet address
    ✓ Export private key
    ↓ Navigate to
Home Dashboard (/home)
```

### New Routes Added
- `/wallet` - User profile & embedded wallet management

## 📱 Features on Wallet Page

### User Profile Display
- ✅ Google profile picture (if signed in with Google)
- ✅ User name from Google or email
- ✅ Email address display
- ✅ Authentication method badge

### Embedded Wallet Features
- ✅ USDC balance on Base mainnet
- ✅ Wallet address with copy button
- ✅ Base network indicator
- ✅ USDC contract address
- ✅ Export private key option
- ✅ Non-custodial security

### Quick Actions
- Send USDC → `/send`
- Receive USDC → `/receive`
- Transaction History → `/activity`
- Sign Out

## 🔧 Configuration Files

### `src/lib/privy-config.ts`
Privy and Wagmi configuration:
```typescript
- Default chain: Base (mainnet)
- Login methods: email, google, wallet
- Embedded wallets: auto-create on login
- Theme: light mode with blue accent
```

### `src/lib/useAuth.ts`
Custom authentication hook:
```typescript
const { 
  authenticated,    // Is user logged in?
  userProfile,      // { email, name, picture, authMethod }
  walletAddress,    // Embedded wallet address
  login,            // Open login modal
  logout,           // Sign out user
  exportWallet      // Export private key
} = useAuth()
```

### `src/pages/wallet.tsx`
Wallet management page:
- Profile picture from Google
- USDC balance (reads from Base contract)
- Wallet address display
- Network information
- Export & security options

### `src/pages/login.tsx`
Authentication page with:
- Privy login button
- Feature highlights (email, Google, wallet)
- Clean, modern UI
- Auto-redirect to wallet after login

## 🌐 Supported Networks

**Base Mainnet**
- Chain ID: 8453
- RPC: https://mainnet.base.org
- USDC Contract: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## 🔑 USDC Balance

The wallet page automatically fetches USDC balance from Base:
```typescript
// Reads USDC balance using wagmi
const balance = await readContract({
  address: USDC_CONTRACT,
  abi: balanceOfABI,
  functionName: 'balanceOf',
  args: [walletAddress]
})
```

## 🎨 UI Updates

### Landing Page
- CTA buttons now link to `/login`
- Auto-redirects authenticated users to `/wallet`

### Home Dashboard
- Profile button links to `/wallet`
- Shows Google profile picture if available
- Displays user name from authentication

### Navigation
All pages check authentication:
```typescript
useEffect(() => {
  if (ready && !authenticated) {
    navigate('/login', { replace: true })
  }
}, [ready, authenticated, navigate])
```

## 🔒 Security Features

1. **Non-custodial** - Users control their private keys
2. **Embedded Wallets** - Privy manages key encryption
3. **Export Option** - Users can export private keys
4. **Base Network** - Fast, low-fee L2 solution
5. **USDC Only** - Stablecoin for price stability

## 📦 Installed Packages

```json
{
  "@privy-io/react-auth": "^1.88.4",
  "@privy-io/wagmi": "^0.2.12",
  "@tanstack/react-query": "^5.59.20",
  "viem": "^2.21.49",
  "wagmi": "^2.12.25"
}
```

## 🧪 Testing Checklist

After starting the app:

- [ ] Visit landing page - should show "Get Started" button
- [ ] Click "Get Started" → redirects to `/login`
- [ ] Click "Sign In" → Privy modal opens
- [ ] Test email login → enter email → verify code
- [ ] Test Google login → Google OAuth flow
- [ ] After login → redirects to `/wallet`
- [ ] Check profile picture displays (if Google)
- [ ] Check USDC balance shows (may be $0.00)
- [ ] Check wallet address displays
- [ ] Click "Copy address" → address copied
- [ ] Click "Send USDC" → redirects to `/send`
- [ ] Click "Sign Out" → redirects to landing page

## 🐛 Troubleshooting

### Privy Modal Not Opening
- Check `VITE_PRIVY_APP_ID` is set correctly in `.env`
- Restart dev server: `npm run dev`
- Check browser console for errors

### USDC Balance Shows 0
- This is normal for new wallets
- Fund wallet via:
  - Bridge from Ethereum mainnet
  - Buy USDC on Base via moonpay
  - Transfer from exchange supporting Base

### Google Picture Not Showing
- User must sign in with Google (not email)
- Check `user?.google?.picture` in console
- Picture URL must be accessible

### Wallet Address Not Showing
- Embedded wallet creates on first login
- Refresh page if not showing immediately
- Check `wallets` array in Privy hook

## 🎉 You're Ready!

Your XPay app now has:
- ✅ Modern authentication with Privy
- ✅ Email & Google sign-up
- ✅ Embedded wallets on Base
- ✅ USDC balance tracking
- ✅ User profiles with pictures
- ✅ Secure wallet management

**Next Steps:**
1. Add your real Privy App ID to `.env`
2. Run `npm install`
3. Start the dev server: `npm run dev`
4. Test the authentication flow!

---

**Need Help?**
- [Privy Docs](https://docs.privy.io)
- [Base Network Docs](https://docs.base.org)
- [Wagmi Docs](https://wagmi.sh)
