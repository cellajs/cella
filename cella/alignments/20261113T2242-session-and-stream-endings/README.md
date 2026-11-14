---
breaking: true
clientCacheBump: false
caughtBy: compiler
generate: true
---

# Sessions close, streams close

A deleted user's sessions close through `closeSessions(userId, 'all', 'user_deleted')`, no longer through
`revokeSessions`, and `SessionEndReason` is gone. `evictExcessSessions` is `revokeExcessSessions`,
`endOrganizationStreams(ids, message)` is `closeOrganizationStreams(ids)`, and `streamErrorForEnding` gave way to a
reason table: `closeStreams` takes `{ subscriber, reason }` and `closeStreamsWhere(filter, reason)` closes a set.
`stream-session-sweep.ts` is `stream-session-recheck.ts` with `ensureStreamSessionRecheck`. `pnpm generate` adds
`sessions_revocation_reason_check`.

## What & why

`revokeSessions` stamped nothing for `user_deleted`, so the after-commit half (cache drop, event, stream close) is its own
function. Session liveness is one `liveSession(now)` predicate and one `sessionRefusal(row)` helper, which the request
path and the stream recheck share. Each stream ending is one entry of a table in `session-streams.ts`. A revoked row
always carries its reason now, enforced by a check constraint, so the recheck no longer guesses `sign_out`.

## Blast radius

Apps whose own code calls the renamed helpers or ends streams themselves; the typecheck names each site. Every app's
database gets the check constraint. No wire change: every stream error keeps its code and message.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate` (with the hints of any other schema alignment you apply in the same run).
2. Put `data.sql` in the generated migration before the `ADD CONSTRAINT "sessions_revocation_reason_check"` line.
3. App code that ends streams with a payload of its own adds a reason to `EndingReason` and `streamEndings` in
   `backend/src/modules/entities/helpers/session-streams.ts`, and passes the reason.

## Verify

```sh
pnpm migrate
pnpm check
```
