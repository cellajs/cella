# Sessions are revoked, not deleted

## What & why

A session ends the way an API key does: `sessions` gains `revokedAt`, `revokedBy` (actor, null for the
server's own housekeeping) and `revocationReason` (`sign_out`, `other_session`, `mfa_enabled`,
`session_cap`, `replaced`), and the row stays until the nightly sweep. `revokeSessions` in
`auth-queries.ts` replaces `deleteSession` and `deleteSessionsByIds`; `validateSession` answers 401
`session_revoked`. The route `deleteMySessions` is `revokeMySessions` and returns the revoked rows; the
auth event `session.deleted` is `session.revoked`. The sessions list shows revoked and expired sessions
of the last 30 days; UI copy says revoke, not terminate.

## Blast radius

Sync-breaking for apps that call the renamed queries, route, SDK operation or auth event, or that carry
the removed locale keys (`terminate`, `terminate_all`, `success.session_terminated`,
`success.sessions_terminated`). No `clientCacheVersion` bump: the session wire shape only gains nullable
fields. Three nullable columns on `sessions`: apps run `pnpm generate`.

## Run

No script: manual.

## Manual steps

1. `pnpm generate` for the three `sessions` columns, then `pnpm sdk`.
2. Replace `deleteSession` / `deleteSessionsByIds` calls with `revokeSessions(ctx, { filters, reason, revokedBy })`; never `db.delete(sessionsTable)` outside the sweep.
3. Rename `deleteMySessions` to `revokeMySessions` in SDK calls; read the revoked rows from `data` and mark them in the query cache, they are not gone.
4. Rename `authEvents` listeners and emitters from `session.deleted` to `session.revoked`.
5. Add `revokedAt: null, revokedBy: null, revocationReason: null` to app session mocks; add `isNull(sessionsTable.revokedAt)` to app queries that mean "live session".
6. Replace the removed locale keys with `c:revoke`, `c:revoke_all` and `success.revoke_resource`; add the `revocation_reason.*`, `revoked`, `expired` and `session_history` keys to app languages.

## Verify

```sh
pnpm generate
pnpm sdk
pnpm --filter backend exec vitest run tests/sign-in/sign-out.test.ts src/modules/entities/stream
pnpm check
```
