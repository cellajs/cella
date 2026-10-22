---
syncBreaking: true
clientCacheBump: false
---

# A request message is text, up to 5000 characters

`requests.message` is a `text` column and the create body takes up to 5000 characters (was `varchar(255)`). Run
`pnpm generate`: it alters the column type.

## What & why

A contact message of more than 255 characters was refused, about two sentences. The contact form also stops asking for a
name the request never stored, and requires the message.

## Blast radius

Every app: one generated migration, `ALTER COLUMN "message" SET DATA TYPE text`, which rewrites no rows. No cache change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`; the migration alters `requests.message` to `text`. `pnpm generate` alone is enough.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
