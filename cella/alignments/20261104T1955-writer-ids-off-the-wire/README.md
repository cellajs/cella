---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: revokedBy
---

# Sessions and API keys stop carrying revokedBy

`ApiKey` and the session schemas omit `revokedBy`, a raw actor id that no screen read: a base schema carries no
writers, and a writer a response does show is an `ActorRef`. The column stays. An app that reads `revokedBy` off the
SDK's `ApiKey` or `Session` types stops compiling. An app whose own schemas send a writer id raw (raak `labelSchema`'s
`deletedBy`, projectcampus's `item` and `material` `hiddenBy`) follows the same rule: omit it from the base schema, or
spread `tombstoneShape` or `auditShape` so it goes out as an `ActorRef`.

## What & why

`apiKeySchema` (`service-accounts-schema.ts`) and `sessionBaseSchema` (`me-schema.ts`) call `.omit({ revokedBy: true })`
on their select schema, and the two mocks drop the field. The review found both ids typed `string | null` on the wire
beside `createdBy` as an `ActorRef` on the same row, with no reader in the three repos. `clientCacheVersion` moves to
`v32-writer-ids-off-the-wire`.

## Blast radius

Breaking only for app code that read `revokedBy` from a session or API key response; none exists in raak or
projectcampus. Bumps `clientCacheVersion`: cached sessions and keys hold the field. No database or lens change.

## Run

No script: manual.

## Manual steps

1. If `shared/config` sets its own `clientCacheVersion`, change its value.
2. A read of `revokedBy` that typecheck flags: drop it, or add the field to the full schema as `nullableActorRefSchema` resolved by `withActorRefs`.
3. An app product schema that sends a `<verb>By` column raw: omit it from the base schema or spread `tombstoneShape`.

## Verify

```sh
pnpm check
```
