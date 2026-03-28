# chat-engine-x-api

Standalone backend service that centralizes AI chat orchestration across multiple platforms.

## Stack

- **Runtime:** Node.js 20 + TypeScript
- **Framework:** Hono
- **Database:** Supabase (Postgres)
- **Secrets:** Doppler
- **Deployment:** Railway (Docker)

## Local Development

```bash
# Install dependencies
npm install

# Run the server (requires env vars — use Doppler or .env)
doppler run -- npm run dev

# Or with a local .env file
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Type check
npm run typecheck
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/live` | Liveness check (always 200) |
| GET | `/health/ready` | Readiness check (verifies Supabase) |

## Deployment

Pushes to `main` auto-deploy via Railway.

### Required Setup

1. **Doppler:** Create project `chat-engine-x-api` with `prd` config containing all secrets
2. **Railway:** Add `DOPPLER_TOKEN` env var (service token from Doppler)

## Project Structure

```
chat-engine-x-api/
├── src/
│   ├── index.ts              -- Hono app entrypoint
│   ├── config.ts             -- Typed config from env vars
│   ├── db.ts                 -- Supabase client singleton
│   ├── logger.ts             -- Structured JSON logging
│   ├── middleware/
│   │   ├── cors.ts           -- CORS handling
│   │   ├── error-handler.ts  -- Global error handler
│   │   └── request-id.ts     -- Request ID generation
│   └── routes/
│       └── health.ts         -- Health check endpoints
├── docs/
│   └── PRD.md
├── Dockerfile
├── railway.toml
├── tsconfig.json
└── .env.example
```
