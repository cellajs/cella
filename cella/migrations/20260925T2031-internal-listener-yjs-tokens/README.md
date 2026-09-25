# Internal listener and per-entity Yjs tokens

## What & why

The CDC socket and `POST /internal/yjs/materialize` answer only on `INTERNAL_PORT`, routed from the private load
balancer pool. Yjs tokens are Ed25519-signed per entity for five minutes (`GET /{tenantId}/{organizationId}/yjs/token`);
the relay verifies with a public key and cannot mint. `YJS_SECRET` becomes `YJS_TOKEN_PRIVATE_KEY`,
`YJS_TOKEN_PUBLIC_KEY` and `YJS_RELAY_SECRET`. Materialize credits the newest editor who may still update.

## Blast radius

Sync-breaking for every app with Yjs, custom materializers or its own infra. Needs an infra `Apply` for the new
secrets and ports. No database change.

## Run

No script: manual.

## Manual steps

1. Replace `YJS_SECRET` in every env with the three new variables; `pnpm --filter backend yjs:public-key` derives the public key.
2. Add `devPorts.internal` to the app config.
3. Pass `organizationId` to `CollaborativeBlockNote`; drop `YjsTokenFetcher` and `collaborativeProduct`.
4. App materializers refuse with a 403 or 404 `AppError`.
5. Rename `internalRoute` to `internalPort` in service config, then run the infra `Apply`.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/internal-listener.test.ts
TEST_MODE=full pnpm vitest run --project=yjs
pnpm --filter infra exec vitest run
pnpm check
```
