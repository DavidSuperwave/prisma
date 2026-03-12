# AGENTS.md

## Cursor Cloud specific instructions

This is a single Next.js (App Router) marketing site. See `README.md` for standard dev commands (`npm install`, `npm run dev`, `npm run build`, `npm run lint`).

### Services

| Service | Port | Command |
|---|---|---|
| Next.js dev server | 3000 | `npm run dev` |

No databases, Docker, or background workers are required.

### Non-obvious notes

- The WhatsApp chat demo on the homepage calls `/api/chat`, which proxies to OpenRouter. Without a valid `OPENROUTER_API_KEY` in `.env.local`, the chat gracefully returns a Spanish error bubble — the rest of the site works fine.
- `.env.local` must exist (copy from `.env.local.example`). The dev server reads it automatically.
- The project uses `"latest"` for all core dependencies in `package.json`. Running `npm install` may pull newer versions; this is intentional.
- ESLint has both `eslint.config.mjs` (flat config) and `.eslintrc.json` present. The lint script uses `eslint . --ext .js,.jsx,.ts,.tsx`.
