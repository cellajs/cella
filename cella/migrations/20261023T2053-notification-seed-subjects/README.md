---
syncBreaking: false
clientCacheBump: false
---

# Notifications seed mentions in the admin's own channels, typed by a seam

The notifications seed picks its subjects from `seedMentionEntityTypes` in the new app-owned
`backend/src/modules/notification/notification-seed-subjects.ts` (default `['attachment']`). An app whose inbox should
show another product names it there and pins the file. `mentionDocument` in `backend/scripts/seeds/description-document.ts`
gives way to `appendMention`.

## What & why

The seed took the admin's attachments per organization and any organization member as the author, so an app homing
attachments in sub-channels seeded mentions in channels the admin is no member of: the link opened a 404. It now
mentions the admin in the newest rows homed in channels the admin belongs to, by another member of that channel,
appending the mention to the description, and writes the inbox rows before the edits so a running CDC worker adds none.

## Blast radius

Not sync-breaking: an app that keeps the default seeds attachment mentions as before, now dealt over its home channels up to
20. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. To seed mentions in another product, set `seedMentionEntityTypes` in `notification-seed-subjects.ts` (its module must declare `notifications`) and add the path under `pinned` in `cella/cella.config.ts`.
2. Replace any app import of `mentionDocument` with `appendMention(description, user, body)`.

## Verify

```sh
grep -rn "mentionDocument" backend
pnpm check
```
