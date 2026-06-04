# CDC WAL accumulation & sync-reliability concept plan

Status: concept / for discussion. No code changes implied by this document.

## Problem statement

The CDC worker consumes a Postgres logical replication slot (`cdc_slot`) and pushes
activity events to the backend over a WebSocket. When the WebSocket is down, the
worker deliberately **stops acknowledging** the slot (`setupBackpressure` in
[replication.ts](../cdc/src/pipeline/replication.ts)), so Postgres retains all WAL
until the backend can receive it again. This guarantees no data loss, but it means
an outage of hours pins WAL on the primary's disk and grows the slot without bound.

Three challenges fall out of this:

1. **Bounding WAL growth** — where and how do we cap accumulation safely?
2. **Acking the events we'd discard anyway** while WS is down — can we advance the
   slot without losing anything that matters, and does it meaningfully slow growth?
3. **Telling clients the sync engine is unreliable** — when WAL is lost (or the WS /
   WAL halves are split), how do online clients learn they must stop trusting
   `staleTime: Infinity` and fall back to old-school fetch-on-navigation?

Relevant current facts:

- Local dev already sets `max_slot_wal_keep_size=2GB` in
  [compose.yaml](../backend/compose.yaml#L25).
- Production is **Scaleway managed PG**, where raw WAL params are **not user-settable**
  via Pulumi (`rdb.enable_logical_replication` flips `wal_level`, but
  `max_slot_wal_keep_size` is in the same rejected family as `max_replication_slots`).
  Scaleway also **auto-drops a slot after 24h** of inactivity.
  (see `/memories/repo/scaleway-managed-pg-logical-replication.md`)
- The worker already polls `walLagBytes` via `pg_wal_lsn_diff(..., confirmed_flush_lsn)`
  in [cdc-metrics.ts](../cdc/src/services/cdc-metrics.ts#L116) but **nothing acts on it**.
- Client product-entity queries use `syncStaleTime()` →
  `Infinity when stream live, 5 min otherwise`
  ([sync-stale-config.ts](../frontend/src/query/basic/sync-stale-config.ts)),
  keyed off `isSyncStreamLive()`.
- The backend can already broadcast `StreamNotification`s to connected clients via the
  SSE [dispatcher.ts](../backend/src/modules/entities/stream/dispatcher.ts).

---

## Challenge 1 — Bounding max WAL accumulation

The real "hard limit" in any slot-based CDC is **slot invalidation**: once retained
WAL exceeds `max_slot_wal_keep_size`, Postgres marks the slot `wal_status = 'lost'`
and discards the WAL rather than filling the disk. After that, replay is impossible
and a full re-derivation is required. The question is *where* to enforce that bound.

### Option 1A — Set `max_slot_wal_keep_size` at the database (server) level

Set it as a Postgres server parameter (already done locally; would need a
Scaleway-supported mechanism in prod).

- **Pros**
  - The only mechanism that actually protects the **primary's disk** from filling.
    A full disk takes the *whole database* read-only/down — far worse than losing CDC.
  - Converts the worst case from "DB outage" into "slot invalidated, CDC recoverable".
  - Zero application logic; enforced by Postgres atomically.
- **Cons**
  - On Scaleway managed PG this parameter is **not currently user-settable** via Pulumi
    settings, so prod can't rely on it without Scaleway support / a parameter-group path.
  - It's a blunt instrument: it caps disk but gives the app no early warning or graceful
    degradation — the slot just dies.
  - The bound is in *bytes of WAL*, not events, so it's hard to reason about in
    business terms ("how many minutes of outage does 2 GB buy us?").
- **Recommendation**: **Yes — keep/raise it as the disk safety net**, but treat it as
  the last line of defence, not the primary control. Keep local at 2 GB; for prod,
  open a path with Scaleway (parameter group or support request) to set a generous
  value (e.g. 10–20 GB sized to the data disk). Document that prod currently lacks it.

### Option 1B — Enforce a soft cap inside the CDC worker (app-level)

The worker already measures `walLagBytes`. Add a configurable threshold
(`RESOURCE_LIMITS` in [constants.ts](../cdc/src/constants.ts)) that escalates as the
slot grows: warn → `unhealthy` health status → emit an explicit control message.

- **Pros**
  - Works **regardless of provider** — no dependency on Scaleway-settable params.
  - Gives **graded, observable** behaviour: alert/page before anything is lost, and a
    defined "we are about to be in trouble" state.
  - Lets us choose the *response* (alert, force-resync signal, even self-throttle)
    rather than a silent slot death.
- **Cons**
  - Does **not** protect the disk by itself — the worker can only *observe* and signal;
    Postgres still retains WAL until something acks it. If the backend is truly down for
    hours, the soft cap can fire but WAL keeps growing.
  - Adds moving parts (threshold tuning, new control message, alert wiring).
- **Recommendation**: **Yes — this is the primary control we should build.** It's the
  portable, observable layer. Pair it with 1A so the app degrades gracefully *before*
  the hard Postgres bound is hit.

### Option 1C — Detect slot invalidation (`wal_status`) and treat it as the formal "broken" trigger

Extend the existing `pollLag` query to also read `wal_status` / `active` from
`pg_replication_slots`. `wal_status = 'lost'` (or Scaleway's 24h auto-drop) is the
unambiguous "WAL is gone, sync cannot be trusted" event.

- **Pros**
  - Turns the genuine hard failure into a **first-class, detectable signal** instead of
    silent data loss.
  - It's the correct place to fire the client-facing "sync unreliable / resync required"
    escalation (Challenge 3) and the backend full cache bust.
  - Tiny change — same query that already runs every poll.
- **Cons**
  - Detection only; recovery (a real source-of-truth re-derivation beyond
    `recalculateCounters`) is a separate, larger piece of work.
- **Recommendation**: **Yes — build this alongside 1B.** 1B is the early warning;
  1C is the confirmed-failure trigger.

### Where to set it: CDC vs backend/db config — verdict

It is **not either/or**; the two layers do different jobs:

| Layer | Mechanism | Protects | Portable to Scaleway? |
|-------|-----------|----------|------------------------|
| DB/server config (1A) | `max_slot_wal_keep_size` | Primary disk (hard cap) | No (currently) |
| CDC worker (1B + 1C) | `walLagBytes` threshold + `wal_status` poll | App behaviour, alerting, client signalling | Yes |

**Recommendation:** keep the **disk hard-cap at the database level** (1A) where the OS
disk actually lives — the CDC worker cannot protect a disk it doesn't own — and put the
**graceful-degradation logic in the CDC worker** (1B + 1C) because that's the only layer
that's provider-portable and can drive alerts and client signalling. Do **not** try to
implement the disk cap inside CDC; it has no authority to stop Postgres retaining WAL.

---

## Challenge 2 — Ack the events we don't need while WS is down

Today, while WS is down, **every** LSN ack is held. But a large fraction of WAL is
events the pipeline would discard anyway. The idea: ack (advance past) only those,
without losing anything the clients actually need.

What the pipeline already discards (and could therefore safely ack even while WS is down):

- **Untracked tables** — `parseMessage` returns `null` when the table isn't in the
  registry ([parse-message.ts](../cdc/src/pipeline/parse-message.ts#L33)).
- **Seeded inserts during catch-up** — skipped by `isSeededInsert`
  ([handle-message.ts](../cdc/src/pipeline/handle-message.ts)).
- **Cascaded child deletes** — suppressed in the
  [transaction-buffer.ts](../cdc/src/services/transaction-buffer.ts) (a 100k-row org
  delete collapses to ~8 surviving events).
- **Soft-cascade embedding updates** — also suppressed in the transaction buffer.
- **Heartbeats / relation / origin / type** messages — non-DML, carry no client state.

### Option 2A — Ack discardable events immediately, even while WS is down

When `parseMessage` returns `null` (untracked / non-DML) or an event is suppressed,
advance the slot to that LSN regardless of WS state. Only **hold** acks for events that
produced a surviving, client-relevant payload that hasn't been delivered.

- **Pros**
  - Can be a **large** reduction in retained WAL for exactly the workloads that cause
    runaway growth: bulk deletes (cascades), high-churn untracked tables, seed/import jobs.
  - No durability risk for these classes — by definition the client never needed them.
  - Small, well-scoped change; the classification already exists in the pipeline.
- **Cons / caveats**
  - **LSN ordering is the catch.** Acking LSN N implicitly acks *everything ≤ N*. You can
    only safely fast-ack a discardable event if there is **no still-undelivered relevant
    event before it**. So this helps most when the *tail* of the WAL is discardable
    (e.g. a giant cascade delete with nothing pending behind it), and helps little when
    relevant and discardable events are interleaved with an undelivered relevant event
    sitting at a lower LSN.
  - Needs a "high-water mark of safely-ackable LSN" = min(LSN of oldest undelivered
    relevant event) − 1. More bookkeeping than today's "hold everything".
  - While WS is down there are by definition undelivered *relevant* events piling up, so
    once the first relevant event is held, you cannot advance past it even if later events
    are discardable. The win is therefore **front-loaded**: you ack discardable events up
    to the first held relevant one, then stop.
- **Impact assessment**: **Significant for delete/import-heavy bursts, modest for steady
  mixed traffic.** The dominant runaway-growth scenario in this codebase is bulk context
  deletes (cascades) and seed/import storms — precisely the discardable classes — so for
  the *specific* worst cases this can cut retained WAL dramatically. For ordinary
  interleaved traffic during a long WS outage, the benefit is bounded by the first
  undelivered relevant event.
- **Recommendation**: **Worth doing, with correct scope.** Implement a
  "safely-ackable up to" watermark and fast-ack discardable **leading** events. Frame it
  as "reduce WAL pressure from bulk/irrelevant churn", **not** as a general fix for long
  outages (it isn't — see Challenge 1 and the spillover idea below).

### Option 2B — Persistent spillover buffer (the Sequin pattern)

Decouple acking from WS health entirely: write undelivered relevant events to a durable
local store (a CDC-owned table), ack the slot, and replay from the store when WS returns.

- **Pros**
  - Fully **decouples slot advancement from downstream health** — an hours-long WS outage
    stops growing the slot at all. This is the principled fix.
  - Mirrors a proven design (Sequin's internal persistent buffer).
- **Cons**
  - Largest effort: durable buffer, replay ordering, dedup on replay, its own bounded cap
    + pause state (or you've just moved the unbounded-growth problem into your own table).
  - The "store" for a CDC worker is usually... Postgres — so you may be spending WAL/disk
    to save WAL/disk unless the buffer lives elsewhere (separate disk / Redis-like).
- **Recommendation**: **Defer.** High value but high cost. Do 2A first (cheap, targeted),
  measure, and only build 2B if real outages still threaten the slot after 1A+1B+2A.

### Verdict for Challenge 2

Yes, acking the genuinely-discardable events can have **significant** impact for the
bulk-delete / import / untracked-churn scenarios that are the actual cause of runaway
growth here — but it is **not** a general solution for long outages because LSN ordering
forces you to stop at the first undelivered relevant event. Recommend **2A now**,
**2B deferred**.

---

## Challenge 3 — Informing clients the sync engine is unreliable

Two sub-scenarios:

- **Split halves**: WAL/slot healthy but WS down, or WS up but WAL lost/invalidated.
- **Post-loss**: events were dropped past `max_slot_wal_keep_size` → caches may be
  permanently stale until a full refetch.

The client's trust in `staleTime: Infinity` is gated entirely on `isSyncStreamLive()`
([sync-stale-config.ts](../frontend/src/query/basic/sync-stale-config.ts)). The lever we
want is: **flip clients out of "infinite trust" mode** when sync can't be trusted, so a
page navigation/refresh does a normal fetch again.

### Option 3A — Derive client trust from a backend-reported sync-health flag (not just SSE connectedness)

Today `isSyncStreamLive()` only reflects the *client's own SSE connection*. It does **not**
know whether the **CDC→backend** half is healthy. Add a backend-reported
`syncReliable: boolean` (driven by the CDC worker's health: WS-to-backend up, slot
`active`, `wal_status != 'lost'`, lag under threshold) and have `syncStaleTime()` return
the fallback (finite) staleTime whenever `syncReliable` is false — even if the client's
own SSE is connected.

- **Pros**
  - Closes the exact blind spot: a client can be happily connected to the backend SSE
    while the **CDC half is dead**, today still trusting `Infinity`. This fixes that.
  - Reuses the existing `syncStaleTime()` lever — minimal client surface area.
  - Naturally covers the "WS up / WAL down" split.
- **Cons**
  - Needs the backend to surface CDC health to clients (it already receives CDC `health`
    control messages in [cdc-websocket.ts](../backend/src/lib/cdc-websocket.ts); needs a
    client-facing channel — see 3B/3C for delivery).
  - Flipping global staleTime to finite causes a refetch wave on next navigation
    (intended, but worth rate-considering).
- **Recommendation**: **Yes — this is the core mechanism.** Make client trust a function
  of *end-to-end* sync health, not just local SSE.

### Option 3B — Broadcast a `sync_degraded` / `sync_lost` control notification over SSE

Use the existing SSE [dispatcher.ts](../backend/src/modules/entities/stream/dispatcher.ts)
to push a system-level control notification to all connected clients when CDC health
changes, carrying a severity (`degraded` vs `lost`). The client sets a store flag that
feeds 3A.

- **Pros**
  - **Push, not poll** — clients react within seconds, no waiting for the next request.
  - Can carry severity: `degraded` (lag high / WS-to-backend flapping → tighten staleTime)
    vs `lost` (`wal_status = 'lost'` → force refetch / full invalidation).
  - Infrastructure already exists; it's a new notification type, not a new transport.
- **Cons**
  - Only reaches **currently-connected** clients. A client that connects *after* recovery
    must learn current state some other way (→ 3C).
  - Requires a public-stream security review so a system signal can't leak tenant data
    (it shouldn't carry any).
- **Recommendation**: **Yes — primary delivery for online clients.** Pair with 3C for
  newly-connecting clients.

### Option 3C — Expose sync-health on the catchup/health response clients already call

Clients already hit catchup endpoints and `/auth/health` on (re)connect. Include the
`syncReliable` flag (and a `resyncRequired` marker) in that response so a client learns
the current state at connect time, not only via live broadcast.

- **Pros**
  - Covers **newly-connecting / refreshed** clients that missed the live broadcast.
  - No new transport; piggybacks on an existing request clients already make.
  - Natural place to also tell the client "your cursor is older than what WAL still
    has → you must full-refetch" after a slot loss.
- **Cons**
  - Pull-based: only as fresh as the client's next catchup/health call (fine as a
    backstop to 3B's push).
- **Recommendation**: **Yes — the backstop.** 3B (push) + 3C (pull on connect) together
  cover both online and reconnecting clients.

### Option 3D — On confirmed WAL loss, force finite staleTime + targeted invalidation

When CDC reports `wal_status = 'lost'` (Challenge 1C), the client should not merely
tighten staleTime — cached product-entity data may be **permanently** stale because the
seq-based catchup can no longer replay the gap. Action: switch affected queries to finite
staleTime **and** invalidate (or mark stale) the synced query caches so the next render
refetches from source.

- **Pros**
  - Correctness: after WAL loss, seq/catchup can't reconcile, so a one-time hard refetch
    is the only way back to truth — exactly the "old-school fetch" the user described.
  - Scopes the expensive action (full invalidation) to the genuinely-broken case, not to
    every transient degrade.
- **Cons**
  - A coordinated refetch wave across all clients = load spike on recovery (mitigate with
    jitter, which the stream layer already uses for reconnects).
  - Must scope invalidation to **synced** caches (product entities), not the whole client
    cache, to avoid needless churn.
- **Recommendation**: **Yes, gated strictly on the `lost` severity.** Degrade = tighten
  staleTime only; lost = tighten + invalidate. This is the client-side analogue of the
  backend's existing `catchup_complete` cache bust.

### Verdict for Challenge 3

Build a single end-to-end notion of **sync reliability** with two severities:

- **`degraded`** (WS/CDC flapping, lag high, slot still intact): flip
  `syncStaleTime()` to its finite fallback so navigation refetches — but keep caches.
- **`lost`** (`wal_status = 'lost'` / slot dropped): finite staleTime **plus** invalidate
  synced caches so clients do old-school fetches and rebuild from source.

Deliver it via **3B (SSE push)** for online clients and **3C (catchup/health response)**
for reconnecting ones, with **3A** as the client lever and **3D** as the hard-loss action.

---

## Recommended sequencing (smallest → largest)

1. **1C** — poll `wal_status` in the existing `pollLag` query; surface `lost`/`active`.
   *(tiny, unlocks everything else)*
2. **1B** — act on `walLagBytes`: warn → `unhealthy` → escalate. *(small)*
3. **3A + 3B + 3C** — end-to-end `syncReliable` flag, SSE `sync_degraded`/`sync_lost`
   broadcast, and health/catchup-response backstop. *(medium)*
4. **3D** — on `lost`, force finite staleTime + invalidate synced caches. *(small once 3A–C exist)*
5. **2A** — fast-ack leading discardable events via a "safely-ackable LSN" watermark. *(medium)*
6. **1A** — pursue a Scaleway-supported `max_slot_wal_keep_size` for prod disk safety. *(ops/infra)*
7. **2B** — durable spillover buffer. *(large, only if outages still threaten the slot)*

## Open questions

- Can Scaleway managed PG-17 expose `max_slot_wal_keep_size` via a parameter group or
  support request? If not, 1B/1C carry the entire prod story and 1A is local-only.
- What lag thresholds (bytes and/or minutes) map to `degraded` vs imminent `lost`? Size
  them against `max_slot_wal_keep_size` and the data disk.
- Does the public (unauthenticated) stream need the `sync_degraded`/`sync_lost` signal,
  and if so, what's the minimal, tenant-safe payload?
- After a `lost` event, is `recalculateCounters` + cache clear enough, or do we need a
  true keyset-cursor re-derivation of activities/seq from source tables?
