# Scaling with `worker_threads` and `cluster` — a brainstorm

> **Status:** Brainstorm / exploration. No decision, no code proposed. This is a thinking aid
> for *where Node's in-box concurrency primitives (`cluster`, `worker_threads`) would actually
> earn their keep* in cella's architecture.
>
> **Key reframe (from the consolidation discussion):** these primitives are a poor fit for the
> [single-server](./SINGLE_SERVER_CONSOLIDATION.md) profile — that profile exists to be *cheap*
> and *simple*, so deliberately consuming every core of a small box defeats its purpose. They
> are far more interesting for the **split-VM** profile, because that is the profile we want to
> *invest scalability into*: a service gets its own dedicated VM, and the open question is how
> to make one service use a bigger VM well.
>
> Read alongside [SINGLE_SERVER_CONSOLIDATION.md](./SINGLE_SERVER_CONSOLIDATION.md) (vertical
> co-location of subsystems) and [MULTI_FORK_SHARING.md](./MULTI_FORK_SHARING.md) (horizontal
> sharing across forks). This doc is a *third* axis: using all cores of a single VM for a
> single subsystem.

---

## TL;DR

- **`cluster` = more processes; `worker_threads` = more threads in one process.** Cluster gives
  you isolation (separate heaps/event loops, OS load-balances a shared socket). Threads give
  you shared memory (`SharedArrayBuffer`, `MessagePort`) at lower overhead but no fault
  isolation.
- **Single-server profile: don't bother.** Its whole point is one cheap event loop on a small
  box. Adding threads/cluster there re-introduces the complexity the profile is trying to
  avoid. Keep it a single event loop.
- **Split-VM profile: this is where it's interesting** — but only for the subsystems whose
  scaling axis is *CPU/connections on one box*, and only where it beats the cheaper default of
  "just run another VM behind the LB".
- **Per subsystem the answer differs sharply:**
  - **API** → `cluster` is the textbook fit, but the existing **LB-overlap horizontal model
    already scales it**; cluster only wins on fewer-bigger-VMs economics.
  - **Yjs** → the most promising candidate, but needs **room-sharding** (sticky-by-document),
    not naive clustering — two workers must never hold the same `Y.Doc`.
  - **CDC** → the slot is single-consumer and **cannot** be parallelized at ingest; but the
    *downstream processing* could fan out to `worker_threads` (partitioned to preserve
    ordering). Genuinely interesting for WAL-throughput headroom.
  - **AI** → mostly I/O-bound (model calls); **pg-boss concurrency already covers it**. Threads
    only help the rare CPU-heavy step (local embedding/tokenization).

---

## The two primitives

| | `cluster` | `worker_threads` |
|---|---|---|
| Unit | OS process | thread in one process |
| Memory | isolated heap per worker | shared process; `SharedArrayBuffer` for shared bytes |
| Fault isolation | strong (a worker crash ≠ master crash) | weak (an unhandled throw can take the process) |
| Socket sharing | built-in — workers share a listening port, OS/master distributes | none built-in; pass handles via `MessagePort` (awkward for sockets) |
| Best for | stateless request fan-out (HTTP) | CPU offload that needs shared state, or partitioned pipelines |
| Startup cost | higher (full V8 per worker) | lower (shares the V8 isolate group) |
| Graceful shutdown | master coordinates per-worker drain | parent coordinates per-thread drain |

Rule of thumb: **`cluster` when the work is embarrassingly parallel and stateless;
`worker_threads` when you must keep shared state or fan out a single ordered stream.**

---

## Why this belongs to the split-VM profile

The single-server profile ([SINGLE_SERVER_CONSOLIDATION.md](./SINGLE_SERVER_CONSOLIDATION.md))
trades isolation for cheapness: one process, one event loop, every enabled subsystem co-resident
on a small box. Spending engineering effort to then *fan that box across cores* is
contradictory — if you have enough load to need all cores, you've outgrown the profile and
should split.

The split-VM profile is the opposite: each subsystem owns a VM (`DEV1-S` today, but nothing
stops a bigger instance type per service — `instanceType` is already per-service in
[services.config.ts](../infra/config/services.config.ts)). There the real question is
**"given a dedicated VM, how do I use it fully for this one subsystem?"** — which is exactly the
`cluster`/`worker_threads` question. So scalability investment and these primitives line up on
the same axis.

---

## Vertical (threads/cluster) vs horizontal (more VMs + LB)

cella already has a **horizontal** scaling story baked into the deploy model: `lb-overlap`
blue-green generations behind a load balancer ([services.config.ts](../infra/config/services.config.ts)).
Adding a second API VM is a config change, and the LB already fans requests across generations.

So the honest question for any vertical proposal is **"why not just run another VM?"**

| | Vertical (cluster/threads on one bigger VM) | Horizontal (more small VMs + LB) |
|---|---|---|
| Already supported? | no — new code | **yes** — `lb-overlap` + per-service sizing |
| Best when | per-VM overhead matters; shared in-memory state (CRDT); single ordered stream to fan out | stateless, LB-friendly; want independent failure domains |
| Cost shape | fewer, bigger boxes (less LB/VM overhead) | more, smaller boxes (finer granularity) |
| Blast radius | bigger (one box = more load) | smaller |
| Deploy interaction | unchanged strategy, but cluster needs in-VM drain coordination | already solved by LB-overlap |

**Vertical only wins where horizontal can't easily go:** stateful sockets that need shared
memory (Yjs), or a single-consumer stream whose *processing* is the bottleneck (CDC). For
stateless HTTP (API) and queue workers (AI), horizontal is already there and simpler.

---

## Per-subsystem deep dive

### API (Hono HTTP) — `cluster`, but horizontal already covers it

The API is stateless request/response, the canonical `cluster` workload: fork N workers, each
binds port 4000, the OS round-robins connections. On a single large VM that uses every core.

**But** the existing `lb-overlap` model already scales the API horizontally, and request state
lives in Postgres/Redis-style backing stores, not process memory — so a second VM is just as
good and already supported. Cluster's only marginal win is **economics**: one `DEV1-L` running 4
cluster workers may be cheaper/simpler at the LB than four `DEV1-S` VMs. Caveats: each worker
needs its own DB pool (multiply pool sizing), and `setupGracefulShutdown` becomes a
master→worker drain dance instead of a single handler.

> Verdict: low priority. Reach for cluster only if VM-count economics specifically favor
> fewer-bigger API boxes. Otherwise keep scaling horizontally.

### Yjs relay — the strongest candidate, via **room sharding** (not naive cluster)

The relay is a `WebSocketServer({ noServer: true })` holding **per-document CRDT state** in
memory ([ws-server.ts](../yjs/src/server/ws-server.ts)), with durable state in
[data/storage.ts](../yjs/src/data/storage.ts) + [data/db.ts](../yjs/src/data/db.ts). Its scaling
axis is **concurrent connections + active documents**, and it pins CPU during merges — the kind
of workload that benefits from more cores.

The trap: **you cannot naive-`cluster` it.** Two workers holding the same `Y.Doc` would diverge —
each is an authoritative replica. Correct vertical scaling requires **sharding by room/document**:

- A thin **router** accepts the WS upgrade, reads the document id, and routes the connection to
  the *one* worker/thread that owns that room (consistent hashing or a room→worker table).
- Each worker owns a disjoint set of rooms and rehydrates them from durable storage — which the
  relay already supports (clients reconnect and resync from durable CRDT state, per the
  `drainPolicy: 'reconnect'` model in [services.config.ts](../infra/config/services.config.ts)).
- `worker_threads` could share a room registry / `SharedArrayBuffer` of doc state, but
  ownership-per-thread (no shared mutable `Y.Doc`) is simpler and safer than shared CRDT memory.

Two ways to realize it:
1. **In-VM (`worker_threads` or `cluster` + sticky upgrade):** one VM, N room-shards, a local
   router on the upgrade path. Uses all cores of a big Yjs VM.
2. **Cross-VM (horizontal):** the LB host-routes by document to N Yjs VMs (sticky). Same
   sharding idea, just at the LB instead of in-process — and closer to the existing model.

> Verdict: highest-value place to invest, *if* collaborative-editing load grows. But the real
> work is **document sharding + a sticky router**, which is the same design whether you shard
> across threads (vertical) or VMs (horizontal). Prototype the router first; choose the
> thread-vs-VM substrate second.

### CDC — ingest is single-consumer; **downstream** can fan out to threads

CDC holds **one** logical-replication slot ([worker.ts](../cdc/src/pipeline/worker.ts):
`ensureReplicationSlot`, `subscribeWithReconnect`) — by definition a single consumer
(`replacementStrategy: 'exclusive'`). You **cannot** parallelize the slot read; that's a hard
Postgres constraint.

What *can* parallelize is everything **after** the read. The pipeline is:
WAL change → parse → buffer by tx → persist activities → compute deltas → WS dispatch
([worker.ts](../cdc/src/pipeline/worker.ts), `drainBuffers`, `setupBackpressure`). The
persist/delta/dispatch stages are CPU + DB work that today share the slot reader's event loop —
and `setupBackpressure` already pauses slot-ack under buffer pressure, which is the tell-tale
sign the *processing* is the bottleneck, not the read.

A vertical design: **one reader thread** owns the slot and the transaction buffer; it fans
completed transactions out to a **`worker_threads` pool**, partitioned by aggregate key (entity
id / organization) so per-entity ordering is preserved. The reader stays single and ordered;
the expensive transform/apply parallelizes across cores. Back-pressure becomes "pool queue
depth" instead of "single event loop saturation".

`cluster` is the wrong tool here (you must not fork the slot reader). `worker_threads` with a
partitioned dispatch is the right shape.

> Verdict: interesting and well-isolated — the slot constraint that blocks co-location actually
> *protects* this design (reader stays singular). Worth a spike if CDC lag/back-pressure becomes
> a real ceiling. Ordering-by-partition is the correctness crux.

### AI (pg-boss) — concurrency already solved; threads only for CPU steps

The AI worker runs a pg-boss job loop. pg-boss already scales via `teamSize`/`teamConcurrency`
and by running more worker instances — and the work is mostly **I/O** (calls to the model API),
which async concurrency handles without threads. Adding more pg-boss workers (more VMs, or more
concurrency) is the cheap path and already supported.

`worker_threads` only help a genuinely **CPU-bound** step done locally — e.g. local
embedding/tokenization, large JSON/document transforms before a call. If/when such a step
exists, offloading just that step to a thread keeps the job loop responsive. Until then, threads
add complexity for no win.

> Verdict: lowest priority. Scale via pg-boss concurrency / more workers. Revisit threads only
> for a specific CPU-bound local step.

---

## Interactions with the existing deploy model

- **Graceful shutdown.** [`setupGracefulShutdown`](../shared/src/) is per-process today. Cluster
  needs the master to fan the drain to workers; worker pools need the parent to await thread
  drain. Either way the per-subsystem `stop()` contract from
  [SINGLE_SERVER_CONSOLIDATION.md](./SINGLE_SERVER_CONSOLIDATION.md) should own the fan-out so
  the deploy lifecycle (`drainSeconds`, `drainPolicy`) still holds.
- **CDC `exclusive` is unaffected** by an internal worker pool — there is still exactly one slot
  consumer per process; the pool is downstream. Good: the hard infra constraint is untouched.
- **Yjs `drainPolicy: 'reconnect'`** composes nicely with sharding — clients already resync from
  durable state, so moving a room between shards/threads/VMs is "just" a reconnect.
- **DB pools multiply** with cluster workers — sizing in env (`*_DB_POOL_MAX`) must account for
  `pool × workers`, or you exhaust Postgres connections.
- **OTel resource identity** — cluster workers / threads should tag a `worker.id` (or thread id)
  alongside the existing `service.name` so per-core metrics don't collapse into one series.

---

## Where to actually invest (if/when load demands it)

1. **Yjs document router + sharding** — highest leverage, and the design is substrate-agnostic
   (threads or VMs). Build the sticky router first; it unlocks both vertical and horizontal Yjs
   scaling. Driven by concurrent-editing growth.
2. **CDC downstream worker pool** — second, gated by real back-pressure/lag. The slot stays
   single; only the transform/apply fans out, partitioned for ordering.
3. **API cluster** — only if VM-count economics favor fewer-bigger boxes; otherwise keep scaling
   horizontally via `lb-overlap`.
4. **AI threads** — only for a concrete CPU-bound local step; otherwise pg-boss concurrency.

**Default stance:** prefer the **horizontal** model already in `lb-overlap` until a subsystem's
scaling axis (Yjs connections, CDC WAL throughput) clearly can't be served by "another VM".
`worker_threads`/`cluster` are the answer for the *stateful* and *single-stream* subsystems,
where horizontal scaling needs sharding anyway — and that work lives squarely in the split-VM
profile, not the single-server one.

---

## Relationship to the other scaling docs

- **[SINGLE_SERVER_CONSOLIDATION.md](./SINGLE_SERVER_CONSOLIDATION.md)** — *fewer* processes
  (everything in one). This doc is the inverse pressure: *more* parallelism within a dedicated
  process/VM. They target opposite ends (cheap-single-box vs scale-one-subsystem) and shouldn't
  be mixed: don't cluster the single-server box.
- **[MULTI_FORK_SHARING.md](./MULTI_FORK_SHARING.md)** — one subsystem serving *many forks*.
  Sharding-by-room (Yjs) and partitioned fan-out (CDC) compose with per-fork routing: the same
  router that picks a shard can also pick a fork.
