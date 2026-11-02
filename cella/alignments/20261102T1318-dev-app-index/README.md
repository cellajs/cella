---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: devPorts, devAppIndex, DB_PORT
---

# Each app on a machine has one dev port number, `devAppIndex`

Add `devAppIndex` to `shared/config/config.default.ts`. The app's dev ports then derive from that number, and the literal ports in `devPorts` and the `frontendUrl` family of `config.development.ts` go back to the template's.

## What & why

`devAppIndex` N adds N to the frontend port and its URLs, and 10N to the other `devPorts`, in development, tunnel and test mode. A browser tab switches apps by the last digit of the port. A dev port that `fetch` refuses, 4045 or 4190, now stops the config build: on 4045 the Yjs relay could not reach the backend.

## Blast radius

Every app's `shared/config`, which is pinned, and `backend/.env`. No database or cache change. Production stops reading an app's literal `devPorts`: folded mcp and oauth workers listen on the template's ports, the ones infra routes to.

## Run

No script: manual.

## Manual steps

1. Pick the number: 0-9, not 4, and not one another app on your machines uses.
2. Add `devAppIndex: <N>` above `devPorts` in `config.default.ts`, and reset `devPorts` to the template's block (3000, 4000-4006).
3. Set the six localhost URLs in `config.development.ts` back to port 3000. Keeping a literal port and a non-zero index adds both.
4. In `backend/.env`, set `DB_PORT` to 5432 + 10N and `DB_TEST_PORT` to 5434 + 10N, also in the three `DATABASE_*_URL` values. Run `pnpm docker`: the volume keeps the data.
5. Run `pnpm --filter backend generate:openapi --force && pnpm --filter sdk generate:sdk` to write the new frontend port into `sdk/gen`: a config edit alone does not invalidate the spec cache.
6. If the frontend port changed, run `pnpm s3:cors` for shared buckets and add the origin to your OAuth and SSO test consoles.

## Verify

```sh
pnpm check
```
