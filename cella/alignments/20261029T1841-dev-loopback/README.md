---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: 0.0.0.0, DB_PORT, DB_TEST_PORT, DB_A11Y_PORT, docker run, fs.allow, drizzle-studio
---

# Dev servers and database ports bind loopback

An app-owned listener that binds `'0.0.0.0'` takes `listenHost()` from `shared/utils/listen-host`, and an app's own
compose file or `docker run -p` publishes `127.0.0.1:<host port>:<container port>`. A developer who opens the app on
another device starts it with `DEV_HOST=0.0.0.0`, and Drizzle Studio starts with `pnpm studio`, never with `pnpm dev`.

## What & why

Outside production and staging, the dev databases, Vite and the seven service listeners bound every interface: a peer on
the same network signed in to Postgres as the superuser with the published password, replaced the CDC worker with the
example secret, and read repo files through Vite. They now bind `127.0.0.1`, Vite serves only the folders in
`server.fs.allow`, and Drizzle Studio, which runs any website's SQL as `DATABASE_ADMIN_URL`, leaves `pnpm dev`.

## Blast radius

Every app's local setup; deployed modes keep `0.0.0.0`. No database, wire, lens or cache change. `.env` URLs with
`0.0.0.0:<port>` keep working: a connect to `0.0.0.0` reaches a loopback listener. Running containers keep their old
binds until `pnpm docker` recreates them.

## Run

No script: manual.

## Manual steps

1. `pnpm docker`, and `pnpm docker:test` for the test database: each recreates its container on `127.0.0.1`.
2. An app that edited `backend/compose.yaml`, or runs a compose file or `docker run -p` of its own, prefixes each published port with `127.0.0.1:`.
3. An app-owned `serve`, `listen` or `createServer` that binds `'0.0.0.0'` takes `hostname: listenHost()`.
4. An app frontend that reads a file outside `frontend`, `shared`, `sdk`, `locales`, `json` and `node_modules` by a path no module imports (a `?raw` or `?url` import, a CSS `url()`) adds its folder to `server.fs.allow` in `frontend/vite.config.ts`.
5. A devcontainer, or another container that runs `pnpm dev` and publishes the frontend port, sets `DEV_HOST: 0.0.0.0` in its environment: a published port reaches the container's interface, not its loopback.

## Verify

```sh
docker ps --format '{{.Names}} {{.Ports}}'   # every database port starts with 127.0.0.1
pnpm check
```

With `pnpm dev` running, `lsof -nP -iTCP -sTCP:LISTEN` lists the frontend and service ports on `127.0.0.1` only, and the
app and `/docs` load with no 403 in the Vite log.
