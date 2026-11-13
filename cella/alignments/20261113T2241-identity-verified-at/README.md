---
breaking: true
clientCacheBump: false
caughtBy: compiler
generate: true
---

# An identity is verified by its verifiedAt

`identities.verified` is gone: an identity is verified when `verifiedAt` is set, read as `verifiedAt !== null` in code
and `isNotNull(identitiesTable.verifiedAt)` in a query. `insertIdentity` keeps its `verified` option, which stamps
`verifiedAt`. `pnpm generate` drops the column; port `data.sql` first.

## What & why

The boolean and the timestamp were written together and said the same thing, so a write that set one without the other
would have split them. `verifiedAt` alone is the fact now.

## Blast radius

Every app's database. The typecheck names each typed read or write of `verified` on an identity row; raw SQL that names
`identities.verified` escapes it. The column never reached the SDK, so no wire, cache or client change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate` (with the hints of any other schema alignment you apply in the same run).
2. Put `data.sql` at the top of the generated migration, before the column drop.
3. App code and seeds that read or write `verified` on an identity use `verifiedAt`.

## Verify

```sh
pnpm migrate
pnpm check
```
