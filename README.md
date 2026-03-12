# PrismaProject Homepage

Spanish marketing homepage for PrismaProject with a reusable Noa-inspired layout and an interactive WhatsApp-style agent demo.

## Stack

- Next.js App Router
- React
- Plain CSS with Prisma brand tokens
- OpenRouter via a server-side API route
- Lucide icons

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.local.example .env.local
   ```
3. Add your OpenRouter key to `.env.local`.
4. Start the app:
   ```bash
   npm run dev
   ```

## Environment variables

- `OPENROUTER_API_KEY`: required for live chat mode
- `OPENROUTER_MODEL`: optional, defaults to `openai/gpt-4o-mini`

## Homepage structure

- Hero with Prisma brand system
- Solution cards with media placeholders
- Stats block with placeholders
- Security section
- Audience section for future vertical reuse
- WhatsApp phone clone with demo and live chat modes
- Final CTA block

## Deployment

Deploy directly to Vercel.

Set `OPENROUTER_API_KEY` in the Vercel project settings before using live chat.