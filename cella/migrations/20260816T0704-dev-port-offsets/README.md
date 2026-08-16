# Dev service ports become one config knob (`devPorts`)

## What & why

Local dev service ports were hardcoded in five places (`backend/src/env.ts` PORT
default, `cdc/src/env.ts` API_WS_URL + CDC_HEALTH_PORT defaults, `yjs/src/env.ts`
YJS_PORT default, `mcp/src/mcp-worker.ts`, and the three Vite proxy targets in
`frontend/vite.config.ts`), while only the frontend port (via `frontendUrl`) and DB
ports were fork-offset. Result: every fork's backend binds :4000, so with two stacks
running, whichever backend starts first answers **every** fork's `/api` proxy — the
loser dies with EADDRINUSE and the surviving backend responds with the wrong cookie
slug. All service ports now default from a single `devPorts` block in
`shared/config/config.default.ts` (`api: 4000, cdcHealth: 4001, yjs: 4002, mcp: 4003`),
consumed by the backend/worker env defaults and the Vite proxy. `PORT`-style env vars
still override at runtime.

## Blast radius

Not sync-breaking, no wire shape, no DB, no clientCacheVersion bump. All edited files
are synced template territory; forks that never touched ports sync clean and keep
identical behavior (defaults unchanged). Forks only need action to GET the collision
protection: an offset override in their `config.development.ts`. Forks that hardcoded
a custom PORT in `.env` keep working (env overrides win) but should move the offset
into config so the Vite proxy follows automatically.

## Run

No script — manual (one config block per fork).

## Manual steps

1. Sync the template change, then add a fork-unique offset to your
   `config.development.ts` (pick a free decade; pair it with your frontend port):

   ```ts
   frontendUrl: 'http://localhost:3020',   // ...and the rest of the URL family
   devPorts: { api: 4020, cdcHealth: 4021, yjs: 4022, mcp: 4023 },
   ```

2. Delete any `PORT=` line from `backend/.env` — the config default now governs, and
   a stale env value silently overrides your offset.

## Verify

Run your fork's stack and cella's (or another fork's) concurrently. Both backends must
stay up (`lsof -nP -iTCP:4000 -iTCP:4020 -sTCP:LISTEN` shows two listeners), and each
frontend must answer with its own slug: `curl -sD - -o /dev/null http://localhost:<port>/api/me -H 'cookie: x=y' | grep -i set-cookie`
prints `<your-slug>-development-session-…` — not another fork's.
