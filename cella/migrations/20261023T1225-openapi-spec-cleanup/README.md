---
syncBreaking: true
clientCacheBump: false
---

# Route examples, scopes and docs JSON follow the spec

Drop the third `json()` argument wherever it repeats the response schema's own example: development and tests now
refuse the copy and name each route. Give a route whose guards accept an API key or access token an `xScope` (MCP tool
routes derive theirs). `sdk/gen/docs.gen/` is no longer committed, and the deploy writes each environment's spec from
`backend/.env.example`.

## What & why

The committed spec is the backend's own file, the served `/openapi.json` is normalized, and tag `kind`/`parent` became
`x-kind`/`x-parent` (OpenAPI 3.1). Route examples state only what differs from the schema, and every key or token route
names its scope. Vite derives the docs JSON from the spec, so the build's `/static/openapi.json` and docs carry the
deployed environment's URLs, title and cookie name.

## Blast radius

Sync-breaking for raak and projectcampus: app routes that copy a schema's mock into `json()` throw in development and
tests. A deploy fails at the spec step when `backend/.env.example` cannot pass production validation. No database or
client cache change; oasdiff reports nothing breaking.

## Run

No script: manual.

## Manual steps

1. Run `pnpm sdk`; for each route the error names, delete the mock argument of its `json()` response.
2. Commit the deletion of `sdk/gen/docs.gen/` that `pnpm sdk` leaves (the commit hook stages it).
3. Add `xScope: '<entity>:read' | '<entity>:write'` to non-tool routes guarded by `actorGuard` or `serviceGuard`, matching the action their handler checks.
4. Make sure every variable your `backend/src/env.ts` requires has a valid value in `backend/.env.example`; only `COOKIE_SECRET` gets a placeholder in the deploy.
5. Code that reads `kind` or `parent` on spec tags reads `x-kind` and `x-parent`; drop any `requestValidator: undefined` in tests.

## Verify

```sh
pnpm sdk
pnpm --filter backend test
pnpm check
```
