# Lazy sync migration

The sync engine's live path is now **lazy and negotiated** (see `cella/SYNC_ENGINE.md`,
"Lazy sync scheduling"): notifications enqueue merged seq ranges instead of fetching
immediately, the server suggests a spread window (`syncWindow`), unseen badges are
maintained by a client-side ledger instead of per-batch recounts, and catchup hands
background gaps to the same scheduler. Upstream cella arrives already migrated; forks
have a few manual touch-points.

Pull order: apply [2026-07-batch-cache-removal](../2026-07-batch-cache-removal/) and
[2026-07-detail-cache-tokenless](../2026-07-detail-cache-tokenless/) first if you haven't —
this migration builds on both.

## 1. `appCache()` → `appCache(entityType)` (fork-breaking, TS error on pull)

The detail-cache middleware now needs the entity type to key by URL id:

```sh
grep -rn "appCache(" backend/src
```

Change each product detail route to e.g. `xCache: [appCache('task')]`. Known counts:
**raak 3** (attachment/task/label), **projectcampus 1** (attachment — and consider adding
the other 5 product detail routes while you're here; the cache is free to adopt now).
`pnpm ts` fails on any site you miss.

## 2. Lazy scheduler — automatic, but verify two fork seams

The scheduler arrives via pull with no per-entity work. Verify:

- **Viewing detection for sub-org pages** (`isViewingScope` in `sync-priority.ts`): a page
  counts as "viewed" when a matched route param equals the channel id. If your project/
  course routes use slugs (not ids) in params, the viewing tier misses and the on-screen
  page syncs on the 2–30s background tier instead of live — add an id-based match for your
  routes in `routeMatchesChannel`.
- **Muted/archived tiers** read the membership flags from the `['me','memberships']` query
  cache — works out of the box if your fork kept the standard membership shape.

Behavior changes to be aware of (intentional, see SYNC_ENGINE.md):
- Background pages fetch within ≤30s instead of instantly; the viewed page stays live.
- The caught-up seq watermark advances after a successful flush for singles too.
- Catchup enqueues background gaps lazily; muted scopes get the background tier during
  catchup (one-shot top-up) while live notifications still skip them.

## 3. Unseen ledger — forks with feed filters MUST mirror them

Badges are now computed from synced rows by `ingestSyncedRows` (`seen-store.ts`), a
client-side mirror of your server's unseen predicate (`findUnseenCountsByUser`). If your
fork adds feed-parity filters server-side via `scopeWhereByType` — e.g. **projectcampus
excludes `draft` item rows** — add the same filter inside `ingestSyncedRows`' row loop
(e.g. `if (row.draft) continue;`), or badges drift upward until the next exact reconcile.

## 4. Config invariant — may throw at startup

`config-validation.ts` now asserts every `seenTrackedEntityTypes` entry has
**unconditional** channel read (no `read: 'own'`-style cells). Base cella, raak (`task`)
and projectcampus (`attachment`, `item`) all pass. If your fork trips it, either remove
the type from `seenTrackedEntityTypes` or keep endpoint-based counting for it (revert the
ledger ingest for that type) — a row-conditional read makes row-count badges silently wrong.

## 5. Wire/SDK

`StreamNotification` gained a nullable `syncWindow` field (additive). Run `pnpm sdk`.
Old clients ignore it; without it the scheduler uses a fixed 15s window.

## Gates

```sh
pnpm exec biome check --write .
pnpm ts
pnpm sdk
pnpm --filter frontend test   # realtime + seen suites cover the scheduler/ledger
```
