---
breaking: true
clientCacheBump: false
caughtBy: compiler
generate: true
---

# Attachment keys have no column default, and user flags are typed as the sparse bag they store

`attachments.keys` loses its column default: `InsertAttachmentModel.keys` is required, so every attachment insert passes `keys` with at least `original`, and `pnpm generate` writes one migration that drops the default. `users.userFlags` is typed `Partial<UserFlags>`, and `UserWithActivity` carries the merged `UserFlags` that `userSelect` reads. raak and projectcampus need no edit: their own attachment inserts already pass `keys`, and no own module reads `userFlags`.

## What & why

Both defaults were asserted to a type they do not satisfy. `{} as AttachmentKeys` lacks the required `original`, and every insert passes keys; the create body's own `keys` override goes too, since drizzle-zod applies the `keys` refinement as given. `{} as UserFlags` claimed full flags for a bag stored sparse; every read merges `appConfig.defaultUserFlags`, as `organizationFlags` does for organizations.

## Blast radius

Touches the database: one column default. No wire change: the `User` response keeps full flags, so no `clientCacheVersion` bump and no lens. An app whose own code inserts attachments, or builds a user response from a raw `users` row, follows.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it alone writes the migration, one `ALTER TABLE "attachments" ALTER COLUMN "keys" DROP DEFAULT`; no hints, no hand-written SQL.
2. An attachment insert of the app's own (a seed, a test fixture, a raw `INSERT INTO attachments`) passes `keys: { original: '<storage key>' }`, plus `preview`, `thumbnail` or `converted` once those exist. Typecheck flags a Drizzle insert without it; the database refuses a raw one.
3. App code that turns a raw `users` row into a `UserWithActivity` or a `User` response reads it through `userSelect`, or spreads `appConfig.defaultUserFlags` under its `userFlags`.

## Verify

```sh
pnpm generate
pnpm check
```
