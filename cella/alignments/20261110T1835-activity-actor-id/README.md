---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: activityId, activitiesTable
generate: true
---

# An activity's writer is its actorId

`activities.userId` is `actorId`, and `pnpm generate` with this folder's `hints.json` renames its column `user_id` to
`actor_id`. An `ActivityRow`, a row event of the activity bus and each row of the CDC worker's messages to the API carry
`actorId` where they carried `userId`.

## What & why

The column holds a user or a service account, typed `ActorId`, while its name said user. The stream frame
(`StreamChange` rows) and the notification row already called the same writer `actorId`. One name now holds it from the
CDC worker to the client.

## Blast radius

Every app: `backend/drizzle` is app-owned, and the typecheck names each typed read. A test that builds an activity event
with a cast escapes it. No client wire change: the stream frame already said `actorId`. An API of this release drops
every message of an older CDC worker.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261110T1835-activity-actor-id/hints.json)"`: it renames `activities.user_id` to `actor_id` and nothing else.
2. App code that reads `userId` of an activity, an `ActivityRow` or a `RowActivityEvent` reads `actorId`.
3. A test that builds an activity event or row with a cast (`activityId: …, userId: …`) renames the key to `actorId`.

## Verify

```sh
pnpm migrate
pnpm check
```
