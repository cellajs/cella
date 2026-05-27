# Standalone deployment

Run all services on a single machine using Docker Compose, without Pulumi or Scaleway. Useful for self-hosted setups or local end-to-end testing.

## Quick start

```bash
cd infra
cp .env.example .env   # fill in values (see below)
docker compose --profile all up -d
```

This starts every service (backend, cdc, yjs, ai) plus a [Caddy](https://caddyserver.com/) reverse proxy that handles TLS and routing. See `Caddyfile` for the routing rules.

## Run individual services

```bash
docker compose --profile backend up -d   # API only
docker compose --profile cdc up -d       # CDC worker only
docker compose --profile yjs up -d       # Yjs relay only
docker compose --profile ai up -d        # AI worker only
```

## .env setup

Copy `.env.example` and fill in the required values:

```bash
cp .env.example .env
```

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `DATABASE_ADMIN_URL` | yes | Same as `DATABASE_URL` or a superuser connection |
| `APP_DOMAIN` | yes | Your domain (e.g. `example.com`) |
| `BACKEND_SECRET_KEY` | yes | 32+ byte secret for sessions/cookies |
| `CDC_SECRET` | yes | Shared secret between backend and CDC worker |
| `YJS_SECRET` | yes | Shared secret between backend and Yjs relay |

Generate random secrets with:

```bash
openssl rand -base64 32
```

See `.env.example` for the full list of optional variables (email, uploads, AI, etc.).

## Caddy

`Caddyfile` configures:

- `api.<domain>` → backend on port 4000
- `yjs.<domain>` → Yjs relay on port 4002
- `ai.<domain>` → AI worker on port 4003
- `<domain>` / `www.<domain>` → frontend SPA (static files)

Caddy obtains TLS certificates automatically via ACME. For local development use `localhost` — Caddy issues a local cert you can trust via `caddy trust`.

## PostgreSQL

The standalone setup assumes a PostgreSQL instance is already running. For local use you can start one with Docker:

```bash
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=secret \
  -p 5432:5432 \
  postgres:17
```

Then set `DATABASE_URL=postgres://postgres:secret@localhost:5432/cella` in `.env`.

## After starting

Run migrations and seed the database:

```bash
DATABASE_URL=... DATABASE_ADMIN_URL=... pnpm --filter backend seed -- init
```

Then visit `https://<your-domain>` or `http://localhost` (Caddy will redirect to HTTPS if a domain is set).
