---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: issuer, identities_kind_issuer_subject_idx
generate: true
---

# A connection names its federation, an identity its provider

`connections.issuer` is `federation` and `identities.issuer` is `provider`, and `pnpm generate` with this folder's
`hints.json` renames both columns and the index `identities_kind_issuer_subject_idx`. The `Connection` response and the
`createConnection` body carry `federation` where they carried `issuer`, a pending OAuth sign-up (`PendingSignUp`) names
`provider`, and `findIdentityBySubject`, `findActiveSsoConnectionByClaim` and `findConnectionsClaiming` take the new names.

## What & why

`issuer` named three values: the OIDC issuer URL of a federation, the federation key of a connection, and the OAuth
provider or federation key of an identity. The wire already called the second `federation` and the third `provider`.
One value now has one name, and `issuer` is the OIDC URL alone.

## Blast radius

Every app: `backend/drizzle` is app-owned, and the typecheck names each typed read. Raw SQL, untyped test rows and
outside API clients that name `issuer` on a connection escape it. A sign-up mailed before the deploy needs `data.sql`.
`clientCacheVersion` moves.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261110T1846-federation-provider-columns/hints.json)"` and paste `data.sql` below the generated statements.
2. Replace `issuer` with `federation` on connection rows and bodies, and with `provider` on identity rows and `PendingSignUp`, in app code, raw SQL and tests.
3. Keep `issuer` where it names an OIDC issuer URL: `federations.*.issuer`, `sandbox.issuer` and token verification.

## Verify

```sh
pnpm migrate
pnpm check
```
