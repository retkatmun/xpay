# Contributing to XPay

Thanks for contributing. This repo uses a **fork-and-pull-request** workflow.
Direct pushes to `main` are not permitted.

---

## Workflow

### 1. Fork the repo

Click **Fork** on the GitHub repo page. This creates your own copy at
`https://github.com/<your-username>/xpay`.

### 2. Clone your fork

```bash
git clone https://github.com/<your-username>/xpay.git
cd xpay
```

Add the upstream repo so you can pull in future changes:

```bash
git remote add upstream https://github.com/retkatmun/xpay.git
```

### 3. Create a feature branch

**Never push directly to your fork's `main`.** Always work on a named branch:

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/short-description
```

Branch naming conventions:
- `feat/` — new feature
- `fix/` — bug fix
- `chore/` — dependency updates, config, tooling
- `docs/` — documentation only

### 4. Make your changes

Keep commits focused. Write clear commit messages:

```
feat: add bank account verification step
fix: resolve CORS error on /api/banks/resolve
```

### 5. Keep your branch up to date

Before opening a PR, rebase onto the latest `upstream/main`:

```bash
git fetch upstream
git rebase upstream/main
```

Resolve any conflicts, then push:

```bash
git push origin feat/your-feature-name
```

### 6. Open a pull request

Go to `https://github.com/retkatmun/xpay` and open a PR:

- **Base:** `retkatmun/xpay` → `main`
- **Compare:** `<your-username>/xpay` → `feat/your-feature-name`

Fill in the PR template. Be specific about what changed and how to test it.

### 7. Review and merge

The repo owner will review your PR, leave comments, and request changes if
needed. **Do not merge your own PR.** The owner merges when approved.

---

## Development setup

```bash
# Install root deps
npm install

# Front-end (Vite dev server on :5173)
cd front-end && npm install && npm run dev

# Back-end (Express on :4000)
cd backend && node --env-file=.env dist/index.js
```

See `front-end/.env.example` for required environment variables.

---

## Code style

- Match the existing patterns in the file you're editing — don't introduce new
  libraries, frameworks, or abstractions unless discussed first.
- UI changes: dark theme only, Tailwind utility classes, no inline styles
  unless unavoidable.
- Do not change auth, data-fetching, or business logic unless the PR is
  explicitly about that.
- Run `npm run lint` before pushing.

---

## What not to do

- Do not push to `main` directly (on your fork or this repo).
- Do not open a PR from your fork's `main` branch — always use a feature branch.
- Do not include `.env` files, private keys, or secrets in commits.
- Do not bump dependencies without discussion.
