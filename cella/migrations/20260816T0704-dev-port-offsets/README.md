# Dev service ports become one config knob (`devPorts`)

## What & why

Service listen ports were hardcoded in five places (`backend/src/env.ts` PORT, `cdc/src/env.ts`
API_WS_URL + CDC_HEALTH_PORT, `yjs/src/env.ts` YJS_PORT, `mcp/src/mcp-worker.ts`, the Vite proxy
targets in `frontend/vite.config.ts`), so parallel forks collided on :4000 and the first backend
up answered every fork's `/api` proxy. All now default from one `devPorts` block in
`shared/config/config.default.ts` (`api: 4000, cdcHealth: 4001, yjs: 4002, mcp: 4003`);
`PORT`-style env vars still override.

## Blast radius

Not sync-breaking, no wire shape, no DB, no clientCacheVersion bump; defaults unchanged, so forks
that never touched ports sync clean. Collision protection needs an offset override in
`config.development.ts`; a custom PORT in `.env` still wins (step 2).

## Run

No script: manual.

## Manual steps

1. After syncing, add a fork-unique offset to `config.development.ts` (a free decade, paired with
   your frontend port):

   ```ts
   frontendUrl: 'http://localhost:3020',   // ...and the rest of the URL family
   devPorts: { api: 4020, cdcHealth: 4021, yjs: 4022, mcp: 4023 },
   ```

2. Delete any `PORT=` line from `backend/.env`; a stale env value silently overrides your offset.

## Verify

```sh
# with two forks' stacks running concurrently
lsof -nP -iTCP:4000 -iTCP:4020 -sTCP:LISTEN   # two listeners
curl -sD - -o /dev/null http://localhost:<port>/api/me -H 'cookie: x=y' | grep -i set-cookie   # <your-slug>-development-session-..., not another fork's
```
