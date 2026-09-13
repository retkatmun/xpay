# XPay Frontend

Modern, fast React frontend for XPay built with Vite, React Router, and Tailwind CSS v4.

## Tech Stack

- **Vite** - Lightning-fast build tool and dev server
- **React 19** - Latest React with concurrent features
- **React Router v7** - Client-side routing
- **Tailwind CSS v4** - Utility-first CSS with native CSS variable support
- **TypeScript** - Type-safe JavaScript

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create environment file:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your backend API URL (defaults to `http://localhost:4000`)

### Development

Start the dev server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

### Linting

Run ESLint:
```bash
npm run lint
```

## Project Structure

```
front-end/
├── src/
│   ├── components/     # Reusable UI components
│   ├── lib/           # Utilities and API client
│   ├── pages/         # Page components (routes)
│   ├── App.tsx        # Main app with routing
│   ├── main.tsx       # Application entry point
│   └── index.css      # Global styles with Tailwind
├── public/            # Static assets
└── index.html         # HTML template
```

## Features

- 📱 Mobile-first responsive design
- ⚡ Instant HMR (Hot Module Replacement)
- 🎨 Tailwind CSS v4 with native CSS variables
- 🔒 Type-safe API client
- 🧭 React Router v7 for navigation
- 💾 Session management with context
- 📊 Transaction history and details
- 🏦 Bank account verification
- 💸 Send USDC to XPay users or Nigerian banks
- 📱 QR code and handle-based payments

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:4000` |

## Development Notes

- All API calls go through the centralized client in `src/lib/api/`
- Session state is managed via React Context (`src/lib/session.tsx`)
- Components follow a mobile-first design philosophy
- Custom CSS properties defined in `src/index.css` for design tokens

## License

See LICENSE file in project root.
