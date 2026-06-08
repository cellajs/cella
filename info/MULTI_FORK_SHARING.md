# Sharing infrastructure across forks — Yjs, CDC & a shared Postgres

> **Status:** Concept / exploratory analysis. Not a committed roadmap.
>
> Goal: run N forks of this repository inside **one** Scaleway project, **one** private
> network, **one** managed Postgres, **one** load balancer, and — ideally — **one** Yjs
> relay and **one** CDC worker, instead of paying for a full per-fork stack. Each fork keeps
> only its own frontend bucket, its own backend VM, and its own Pulumi state bucket.
>
> This document is grounded in the actual code paths (`yjs/src`, `cdc/src`,
> `backend/src/db`) and the Pulumi modules (`infra/modules`). Read alongside
> [ARCHITECTURE.md](./ARCHITECTURE.md), [SYNC_ENGINE.md](./SYNC_ENGINE.md), and
> [SYNC_ENGINE_PACKAGING_PLAN.md](./SYNC_ENGINE_PACKAGING_PLAN.md).

---

## TL;DR

- **The headline constraint is Postgres logical replication, not the load balancer.** A logical
  replication slot and a publication are **per-database**. One slot can never stream more than
  one database. So *if you want a single shared CDC worker*, the forks must share **one
  database** and be separated by **schema** (or by `tenant_id` rows), **never** by
  database-per-fork.
- **The HTTP load balancer cannot share Postgres.** It speaks HTTP(S), not the Postgres wire
  protocol. "Sharing one managed Postgres" is a **connection-pooler + multi-tenancy-model**
  problem (PgBouncer / PgCat / Supavisor on the private network), not an LB problem.
- **Yjs is already 95% shareable.** It is a stateless binary relay that isolates by `tenant_id`
  via RLS and delegates entity authorization to "a backend" over HTTP. The only fork couplings
  are `YJS_SECRET`, `appConfig.backendUrl` (which backend verifies access), and where the
  `yjs_documents` table lives. Make those **per-request (token-derived)** instead of
  **per-process (env)** and one relay serves every fork.
- **CDC is the hard one.** Slot/publication names are global constants (`cdc_slot`, `cdc_pub`),
  it streams a whole database, and it pushes to a single `API_WS_URL`. Sharing one CDC requires
  it to become *fork-aware*: resolve the schema from each WAL relation, write the activity into
  that fork's `activitiesTable`, and fan out the notification to that fork's backend.
- **There is a cheap middle ground:** share the **VM**, not the **process**. Run N tiny
  per-fork `yjs`/`cdc` containers on one shared VM. This captures most of the cost saving with
  almost no code change and sidesteps the per-database slot constraint entirely.

---

## 1. What actually couples each service to a single fork today

### 1.1 Yjs relay (`yjs/src`)

Connection flow (`server/upgrade.ts` → `server/auth.ts` → `data/db.ts`):

1. Client connects `wss://yjs.<fork>/<entityId>?token=…&entityType=…&tenantId=…`.
2. `verifyToken()` checks an HMAC signed with **`env.YJS_SECRET`**. The token payload already
   carries `userId`, `entityType`, `tenantId`, `organizationId`, `exp`
   (`server/auth.ts:10-16`).
3. `verifyEntityAccess()` calls **`appConfig.backendUrl` + `/yjs/verify-entity`** with the
   `x-yjs-secret` header (`server/auth.ts:54-67`).
4. DB I/O goes through one `pg.Pool` on **`env.DATABASE_URL`**, and every query runs inside
   `withClient()` which sets `app.tenant_id` / `app.user_id` so **RLS isolates rows**
   (`data/db.ts:14-30`, `data/storage.ts`). All reads/writes target `yjs_documents`.

**Fork couplings (only three, all process-level env):**

| Coupling | Where | Why it blocks sharing |
|---|---|---|
| `YJS_SECRET` | `env.ts`, `auth.ts` | One secret per process; each fork's backend signs with its own |
| `appConfig.backendUrl` | `auth.ts` `verifyEntityAccess` | Hard-wired to one fork's backend for access checks |
| `DATABASE_URL` + `yjs_documents` location | `db.ts` | One DB/schema per process |

Crucially, **`tenant_id` already provides row isolation** and the token already carries it.
Nothing in the relay logic is fork-specific *except* the three env values above.

### 1.2 CDC worker (`cdc/src`)

Flow (`pipeline/replication.ts` → `handle-message.ts` → `services/activity-service.ts` →
`network/websocket-client.ts`):

1. Connects with `env.DATABASE_CDC_URL` (admin role — Scaleway only grants `REPLICATION` to
   `isAdmin` users; `lib/db.ts`).
2. `ensureReplicationSlot()` creates/uses slot **`cdc_slot`** reading publication **`cdc_pub`**
   — both **hardcoded global constants** (`constants.ts:4-9`). This streams **the entire
   database's** WAL.
3. Each change is persisted as an activity and pushed to the backend over a **single
   WebSocket** at `env.API_WS_URL` (wired to one backend VM's private IP in `compute.ts:180`).

**Fork couplings:**

| Coupling | Where | Why it blocks sharing |
|---|---|---|
| `cdc_slot` / `cdc_pub` (global) | `constants.ts` | One slot ⇒ **one database** (Postgres hard limit) |
| Single `API_WS_URL` | `env.ts`, `compute.ts` | All notifications go to one backend |
| `DATABASE_CDC_URL` schema assumptions | `activity-service.ts`, handlers | Writes activities to one schema; no fork routing |
| `appConfig.slug` (`application_name`) | `replication.ts:41` | Cosmetic, but a coupling |

This is the structural reason CDC is harder to share than Yjs: it is a **stateful singleton
bound to one database's replication slot**, and it has to *push* to the right place rather than
just *answer* a request.

### 1.3 Infra (`infra/modules`)

- `naming.ts` derives **every** resource name from `appConfig.slug`, so a stack is intrinsically
  single-fork.
- `compute.ts` creates **one VM per service** (`backend`, `cdc`, `yjs`, `ai`, `frontend`) and
  bakes all secrets + all three DB URLs into each VM's cloud-init `.env`.
- `loadbalancer.ts` already does **host-header routing** (`matchHostHeader: domains.yjs` etc.) —
  this is the lever that lets one LB serve many hostnames/forks.
- `database.ts` provisions one managed Postgres on the private network with `admin`/`runtime`
  roles and `rdb.enable_logical_replication=true`.

The infra is *parameterised* (everything flows from `appConfig`), so it already supports the
"add a fork = add a config" pattern the [INFRA_ARCHITECTURE.md](../infra/INFRA_ARCHITECTURE.md)
describes. What it does **not** have is a notion of a **shared platform layer** vs a **per-fork
layer**.

---

## 2. The Postgres question: how do you share one managed instance?

This is the heart of the request. There are three classic multi-tenancy models; the choice is
forced by the **single-CDC** goal.

| Model | Isolation | Single shared CDC possible? | Schema divergence between forks | Verdict |
|---|---|---|---|---|
| **A. Database-per-fork** | Strongest | ❌ **No** — slot is per-DB ⇒ one CDC per DB | Free | Good isolation, **defeats the shared-CDC goal** |
| **B. Schema-per-fork** (one DB) | Strong (schema + RLS) | ✅ **Yes** — one publication can span schemas | Free (each schema migrates independently) | **The sweet spot for forks** |
| **C. Shared schema, `tenant_id` rows** | Row-level (RLS) | ✅ Yes (already how Cella works) | ❌ All forks locked to identical schema/migrations | Only if forks never diverge structurally |

Forks in this codebase **extend the entity model** (new tables per fork — see the entity
hierarchy builder in ARCHITECTURE.md), so **Model C is unrealistic** (a fork that adds a `book`
table can't share a table set) and **Model A kills the single-CDC goal**. That leaves:

> **Model B — schema-per-fork in one shared database — is the only model that satisfies "one
> managed Postgres *and* one CDC worker" while letting forks evolve their own tables.**

Postgres 15+ supports `CREATE PUBLICATION cdc_pub FOR TABLES IN SCHEMA fork_a, fork_b, …`, so a
**single slot + single publication** can carry every fork's WAL. Each fork's migrations run
against its own schema; RLS (`app.tenant_id`) still provides the row-level safety net the
backend relies on today.

### 2.1 "A proxy that makes a single managed Postgres shared" — what that actually is

The LB can't do this. The standard, battle-tested pattern is a **Postgres connection pooler**
on the private network, sitting between the fleet of backend/yjs/cdc clients and the single
managed instance:

```
fork-a backend ─┐
fork-b backend ─┤        ┌────────────┐        ┌──────────────────────┐
fork-c backend ─┼──TCP──▶│  pooler    │──TCP──▶│ Managed Postgres (1)  │
shared yjs      ─┤        │ PgBouncer/ │        │  schema fork_a        │
shared cdc      ─┘        │ PgCat/     │        │  schema fork_b  …     │
                          │ Supavisor  │        └──────────────────────┘
                          └────────────┘
```

Why you need it and what it buys:

- **Connection multiplication is the real scaling wall.** A `DB-DEV-S` has a low max-connections
  ceiling. With 10 forks × (backend pool + `YJS_DB_POOL_MAX=20` + CDC `max:20`) you blow past it
  immediately. A transaction-mode pooler collapses thousands of client connections onto a small
  fixed server pool.
- **Per-fork routing / `search_path`.** Give each fork a **dedicated DB role** whose default
  `search_path` is its schema (`ALTER ROLE fork_a SET search_path = fork_a`). The pooler then
  routes purely on the role/database in the connection string — no app logic needed for the
  backend. (PgCat can also route by database name to different pools; PgBouncer maps
  database→pool.)
- **Choice of pooler:**
  - **PgBouncer** — simplest, transaction pooling, rock-solid. One pool per (user, db).
  - **PgCat** — PgBouncer-compatible + query routing, load balancing, sharding. Better if you
    want routing logic in the proxy.
  - **Supavisor** — built for huge tenant counts (per-tenant pools), if fork count grows large.
- **Caveat — replication can't go through a transaction-mode pooler.** CDC's logical
  replication connection (`replication=database`) must talk to the **instance directly** (or via
  a session-mode/`replication`-aware path), not through PgBouncer transaction pooling. So CDC
  connects direct; only the *normal* query traffic (backend, yjs) uses the pooler.

Reference best practices: schema-per-tenant + connection pooler is the canonical "many small
tenants, one instance" pattern (the same shape Supabase/Citus/RDS-Proxy deployments use). The
only Cella-specific twist is that RLS already enforces `tenant_id`, so the schema boundary is
**defence-in-depth**, not the sole isolation mechanism.

### 2.2 One physical WAL, N logical slots — what 10 databases actually means

> **Q: With 10 databases on one instance, is there one WAL the 10 CDC micro-containers share, or
> ten WALs?**
>
> **A: One *physical* WAL for the whole instance — but ten *logical replication slots*, each
> decoding only its own database's changes.** These are different layers; don't conflate them.

The distinction:

- **Physical WAL = one per *instance* (cluster-wide).** Postgres writes a single write-ahead log
  stream for the entire server. All 10 databases' writes are interleaved into that one physical
  WAL. There is no per-database WAL file.
- **Logical replication slot = per *database*.** A logical slot is created *in* a specific database
  and, when consumed, **only decodes the changes belonging to that database** — the decoder reads
  the shared physical WAL but filters out everything not for its database. So 10 databases ⇒ 10
  slots (e.g. `cdc_slot` created once inside each of `fork_a`…`fork_j`), and each CDC
  micro-container consumes exactly its fork's changes. No fork sees another fork's rows.

```
            ┌──────────────── one Postgres instance ────────────────┐
            │  one physical WAL  (all DBs' writes interleaved)       │
            │        │                                              │
            │   ┌────┴─────┬───────────┬───────────┐  (decode+filter│
            │   ▼          ▼           ▼           ▼   per database) │
            │ slot a     slot b      slot c      slot …             │
            │ (DB a)     (DB b)      (DB c)      (DB …)              │
            └───┼──────────┼───────────┼───────────┼────────────────┘
                ▼          ▼           ▼           ▼
            cdc-a       cdc-b       cdc-c       cdc-…     (N micro-containers)
```

This means **database-per-fork (Model A) gives you clean per-fork CDC streams with zero CDC code
change** — exactly Shape 2 (§4.2). Each container creates its own `cdc_slot` inside its own
database; the global constant name (`cdc_slot`) is fine because slot names only need to be unique
*within a database*.

**The catch — WAL retention is instance-wide and gated by the *most-lagging* slot.** Because the
physical WAL is shared, Postgres can only recycle a WAL segment once **every** replication slot on
the instance has consumed past it. A single stalled CDC container (or a stuck `fork_x`) **pins WAL
for the whole instance**, and that disk pressure hits *all* forks. So even with database-per-fork:

- `max_replication_slots` / `max_wal_senders` are **instance-wide** limits — 10 forks need the
  instance sized for ≥10 slots/senders (plus headroom for Scaleway's internal HA slots; note
  `database.ts` already sets `sync_replication_slots=on` + `hot_standby_feedback=on`).
- A dead fork's slot must be **dropped or its container kept alive**, or its un-consumed WAL grows
  until the volume fills — taking every fork down. Monitor `pg_replication_slots.restart_lsn` lag
  and alert per slot.
- This is the *same* shared-fate concern as Shape 1's shared slot, but milder: in Model A only the
  **WAL-retention floor** is shared, not the decode/fan-out path — a slow fork lags WAL recycling
  but cannot deliver its changes to another fork's backend.

> Bottom line: **10 databases = 1 physical WAL + 10 logical slots.** You get isolated per-fork CDC
> consumption for free, but the *one shared WAL* means one fork's stuck slot is an
> instance-wide disk risk. Size slots/senders for the fork count and monitor per-slot lag.

---

## 3. Making Yjs fork-agnostic


Yjs is the easy win. The change is to move the three couplings from **process env** to
**per-connection, token-derived** values.

### 3.1 Token-carried routing

Add a `fork` (or `schema`) claim to the Yjs token payload (`server/auth.ts` `tokenPayloadSchema`).
The token is already minted by each fork's backend, so the backend stamps its own identity:

```ts
const tokenPayloadSchema = z.object({
  userId: z.string(),
  entityType: z.string(),
  tenantId: z.string(),
  organizationId: z.string().nullable(),
  fork: z.string(),        // ◀ NEW: fork/schema identifier
  exp: z.number(),
});
```

### 3.2 Per-fork secret & backend resolution

Two options, in increasing isolation:

- **Single shared `YJS_SECRET` across all forks (simplest).** The relay secret only gates the
  *relay handshake*; **real authorization is still the per-fork `verify-entity` backend call**,
  so a shared relay secret does not weaken tenant isolation. Then the relay needs a
  `fork → backendUrl` map (a small env-provided registry or a Secret Manager lookup) to know
  which backend to call in `verifyEntityAccess()`.
- **Per-fork secret (stronger).** Keep a `fork → { secret, backendUrl }` registry; pick the
  secret by reading the `fork` claim from the *unverified* payload first (it's outside the
  signature) or by trying the relevant secret. Slightly more code; cleaner blast-radius.

`verifyEntityAccess()` becomes:

```ts
export async function verifyEntityAccess(fork, entityType, entityId, tenantId, userId) {
  const { backendUrl, secret } = forkRegistry.resolve(fork);   // ◀ per-fork
  const url = new URL('/yjs/verify-entity', backendUrl);
  // …unchanged…
  const res = await fetch(url, { headers: { 'x-yjs-secret': secret } });
}
```

### 3.3 Schema-scoped DB access

`DocContext` gains the schema; `withClient()` sets it per connection (Model B), or you keep one
shared schema and rely solely on `tenant_id` (Model C). For Model B:

```ts
async function setSessionContext(client, schema, tenantId, userId) {
  await client.query('SELECT set_config($1, $2, false)', [`search_path`, schema]); // or SET search_path
  await client.query(
    "SELECT set_config('app.tenant_id', $1, false), set_config('app.user_id', $2, false)",
    [tenantId, userId],
  );
}
```

`yjs_documents` then resolves per-fork via `search_path`; the rest of `storage.ts` is unchanged
(unqualified table names). One `pg.Pool` against the shared instance/pooler is fine — the
session context is reset per checkout.

### 3.4 Net effect

A single Yjs process serves every fork:

```
wss://yjs.fork-a/…  ┐
wss://yjs.fork-b/…  ┼─▶ LB (host-header) ─▶ one yjs VM ─▶ pooler ─▶ shared PG (schema per fork)
wss://yjs.fork-c/…  ┘                                   └─ verify-entity ─▶ fork's backend
```

Effort: **small.** ~1 new token claim, a fork registry, two function-signature changes. The
relay's hot path (binary passthrough, session manager) is untouched.

---

## 4. Making CDC fork-agnostic (the hard part)

CDC cannot be made agnostic the way Yjs can, because it is a **push** singleton bound to a
replication slot. There are two viable shapes.

### 4.1 Shape 1 — One shared CDC, schema-per-fork, fan-out (true single process)

Requires Model B (one DB, schemas per fork, one `cdc_pub` covering all schemas, one `cdc_slot`).

Refactors needed in `cdc/src`:

1. **Resolve the fork from each WAL change.** The pgoutput `Relation` message carries the
   relation's **schema (namespace)**. Map `namespace → fork`. (Today handlers assume a single
   schema.)
2. **Write the activity into the correct schema.** `activity-service.ts` / `create-activity.ts`
   must target `<fork>.activities` (and `<fork>.context_counters`) — i.e. schema-qualified or
   `search_path`-scoped writes per event/transaction.
3. **Fan out to the right backend.** `network/websocket-client.ts` becomes a **pool of WS
   connections keyed by fork** (each fork's backend private IP), or one multiplexed connection
   per backend. The `TransactionBuffer` must group by `(fork, entityType, action, context)` so a
   batch never crosses forks (it already enforces single-context; add fork to the key).
4. **De-hardcode identity.** `application_name` (`replication.ts:41`) and any `appConfig.slug`
   assumptions become per-fork or generic. `CDC_SECRET` either shared or resolved per fork.
5. **Backpressure is now shared.** One slow backend stalls acknowledgement for the shared slot
   (`setupBackpressure` pauses the whole slot). This is a real operational coupling: a single
   unhealthy fork backend creates WAL lag for **all** forks. Mitigate by buffering per-fork and
   only pausing slot ack on global buffer pressure, not per-backend disconnect.

This is the same "scope generalization" the
[SYNC_ENGINE_PACKAGING_PLAN.md](./SYNC_ENGINE_PACKAGING_PLAN.md) describes (`scopeKey`/`scopePath`,
`ScopeProvider`), now with **fork** as an outermost scope level. Effort: **large** (weeks), and
it introduces a shared-fate failure mode (one slot, shared backpressure).

### 4.2 Shape 2 — Database-per-fork, one CDC *VM*, N CDC *containers* (recommended pragmatic)

Keep each fork in its **own database** (Model A — strongest isolation, free schema divergence,
no fan-out refactor) but stop paying for N CDC **VMs**: run all forks' CDC workers as **N small
containers on one shared CDC VM**. Each container keeps its own `cdc_slot` on its own database
and its own `API_WS_URL` — **zero CDC code change**.

```
                 ┌──────────── shared cdc VM ─────────────┐
                 │ cdc-fork-a ─ slot ─▶ DB fork_a ─▶ be-a  │
 one VM, N procs │ cdc-fork-b ─ slot ─▶ DB fork_b ─▶ be-b  │
                 │ cdc-fork-c ─ slot ─▶ DB fork_c ─▶ be-c  │
                 └────────────────────────────────────────┘
```

This is the key reframing: **the cost is the VM, not the process.** The user's pain ("I don't
want to deploy 10 yjs workers") is mostly a *VM-count* problem, and VM-count is solved purely in
infra by moving `yjs`/`cdc` out of the per-fork stack into a **shared stack** that runs N
container profiles. The same applies to Yjs if you don't want to do the §3 refactor: N tiny
`yjs` containers on one VM, each with its own `YJS_SECRET`/`backendUrl`/`DATABASE_URL`.

| | Shape 1 (one process) | Shape 2 (one VM, N containers) |
|---|---|---|
| Postgres model | Schema-per-fork (forced) | Database-per-fork (free isolation) |
| CDC code change | Large (fan-out, schema routing, shared backpressure) | **None** |
| Yjs code change | §3 refactor | **None** (N containers) |
| Failure isolation | Shared slot/backpressure (one fork can lag all) | Per-fork slot, fully isolated |
| Cost saving | Max (1 process) | ~90% of it (1 VM, cheap RAM per container) |
| Connection count | Lowest | Higher (mitigated by the pooler) |

For 10 forks, **Shape 2 captures almost all the saving with almost none of the risk.** Reserve
Shape 1 for when fork count is large enough that even container overhead matters, *and* you've
already done the scope-generalization work in the packaging plan.

---

## 5. Proposed infra split: a shared "platform" stack + thin per-fork stacks

Today everything is one stack keyed on `appConfig.slug`. Introduce two layers:

### 5.1 Shared platform stack (deployed once)

Owns the expensive, shareable resources:

- VPC + **one** private network (`network.ts` as-is).
- **One** managed Postgres (`database.ts`), with `rdb.enable_logical_replication` already on.
- **One** connection pooler (new module: a small VM or container running PgBouncer/PgCat on the
  private network). Backends/yjs point here; CDC points at the instance directly.
- **One** load balancer (`loadbalancer.ts`) — already host-header routing; it gains one
  `Backend` + `Route` per fork hostname (`api.fork-a`, `www.fork-a`, …) and a shared
  `yjs.*` / `cdc` has no public route (internal only).
- **Shared `yjs` VM** and **shared `cdc` VM** running N container profiles (Shape 2) — or single
  shared processes (Shapes §3/§4.1).
- Shared registry, monitoring.

### 5.2 Per-fork stack (deployed per fork, cheap)

Owns only:

- Frontend bucket (`storage.ts` frontend bucket only).
- Backend VM (`compute.ts`, backend profile only) — points at the shared pooler + shared
  yjs/cdc.
- Pulumi state bucket.
- A **migration job** that creates/owns the fork's **schema** (Model B) or **database**
  (Model A), its DB role (with `search_path` default), and — for Model B — registers its tables
  into the shared `cdc_pub` publication.

`naming.ts` needs a second axis: today `resource(suffix)` is `${slug}-${suffix}`. Add a
distinction between **platform-scoped** names (shared) and **fork-scoped** names so a fork stack
doesn't try to recreate the LB/DB/network. This is the one non-trivial infra refactor: split
`deriveInfra` into `derivePlatform(appConfig)` and `deriveFork(appConfig)`.

### 5.3 Load balancer as the public multiplexer

The LB is genuinely the right place to fan **HTTP** traffic across forks — it already matches on
`Host`. Each fork adds:

- `api.<fork>` → that fork's backend VM (its own `Backend` + `Route`).
- `www.<fork>` → frontend (shared frontend Caddy VM proxying to the fork's bucket, or per-fork
  frontend VM if you keep that per-fork).
- `yjs.<fork>` → the **shared** yjs backend (the `fork` claim in the token does the per-fork
  work, §3).

What the LB **cannot** do — and the recurring misconception worth stating plainly — is share the
**database**. That is the pooler's job (§2.1), on the private network, speaking the Postgres wire
protocol.

---

## 6. Squeezing cost further: STARDUST1-S and leaner images

For **staging / demo** forks (not production), the cheapest Scaleway box is the right tool, and
the services here are unusually well-suited to it.

### 6.1 Is STARDUST1-S enough for yjs and cdc?

`STARDUST1-S` — 1 shared vCPU, **1 GB RAM**, 100 Mbps, ~€0.0006/h (~€0.44/mo) — is plausible for
**yjs** and **cdc** in non-production, because both are deliberately lightweight:

- **yjs** is a *pure binary relay* — its own README/Dockerfile stress that it never instantiates a
  `Y.Doc` server-side; it forwards raw `Uint8Array` and persists debounced blobs. Idle/low-concurrency
  RAM is tiny. The main pressure is **connection count × buffers**, not document size. For a demo
  with a handful of editors, 1 GB is ample. Knobs to turn down: `YJS_DB_POOL_MAX` (default 20 →
  e.g. 4) so the pool doesn't reserve a chunk of the shared Postgres connection budget.
- **cdc** is a single-stream replication consumer. Its memory is dominated by the
  `TransactionBuffer` (`maxBufferedEvents: 20_000`, `flushBatchSize: 100`) — fine on 1 GB at demo
  write rates. The risk is **WAL-lag backpressure**: if the buffer fills (a stalled backend, a
  burst), it can grow. For staging, lower `maxBufferedEvents` so a runaway buffer OOM-kills
  predictably rather than thrashing.

Caveats specific to a 1 GB shared-CPU box:

- **Node default heap.** Node sizes its old-space heap from available memory heuristics, but on a
  1 GB box it's worth pinning `--max-old-space-size` (e.g. `NODE_OPTIONS=--max-old-space-size=320`
  for cdc, lower for yjs) so a buffer spike fails fast instead of swapping.
- **OTel overhead is real.** Both workers pull in the full `@opentelemetry/auto-instrumentations-node`
  stack (see their `package.json`). Auto-instrumentation adds tens of MB of resident memory and
  startup cost. For demo/staging, run with tracing **off** (don't set `MAPLE_API_KEY`) or trim to a
  minimal manual SDK — this is often the single biggest RAM win on a 1 GB box.
- **Shared vCPU = burst, not sustained.** STARDUST is fine for bursty relay/replication work but
  will throttle under sustained CPU. Not for production traffic.
- **Backend does *not* fit.** The backend is `DEV1-M` in production precisely because its
  blue-green roll runs OLD+NEW slots side-by-side (see
  [INFRA_ARCHITECTURE.md](../infra/INFRA_ARCHITECTURE.md)). STARDUST is only realistic for the
  *stateless lightweight* workers (yjs, cdc, and arguably the frontend Caddy proxy), not backend.

This dovetails with §4.2 / §5: a single shared STARDUST (or one slightly larger shared box) running
N tiny yjs/cdc **containers** is dramatically cheaper than N VMs, and for staging the per-fork RAM
slice per container is small.

`helpers.ts` already supports this with **zero code change** — `instanceTypeFor(serviceName)` reads
per-service overrides:

```bash
pulumi config set --path infra:instanceTypes.yjs STARDUST1-S
pulumi config set --path infra:instanceTypes.cdc STARDUST1-S
```

So a staging stack can drop yjs/cdc to STARDUST today purely via stack config.

### 6.2 Picking a more efficient container image when maximising downscale

Yes — choosing a leaner base image is **standard practice** when squeezing a VM, and these
Dockerfiles already do the easy 80% but leave a meaningful 20% on the table.

What's already good (`yjs/Dockerfile`, `cdc/Dockerfile`):

- **`node:24-alpine`** multi-stage build — Alpine (musl) is the common "small Node" base; the final
  stage copies only `dist` + production `node_modules`, not the build toolchain. This is the right
  baseline.
- yjs `tsup` bundles `shared` (`noExternal: ['shared']`) so fewer files ship.

Further downscaling options, in increasing effort:

| Option | Effect on image/RAM | Cost |
|---|---|---|
| **Drop OTel deps for staging builds** | Removes the largest chunk of `node_modules` + resident memory | Low — build-arg/flavor toggle; biggest single win |
| **`node:24-alpine` → `node:24-slim` only if glibc needed** | Usually *not* smaller; Alpine is already smaller. Keep Alpine unless a native dep breaks on musl | — |
| **Distroless (`gcr.io/distroless/nodejs24`)** | Smaller attack surface, no shell/pkg-manager, slightly smaller | Low-med; loses `wget` so the compose **healthcheck must change** (it currently uses `wget`/`HEALTHCHECK wget` in the Dockerfiles + `compose.yml`) — use a node-based check |
| **Bundle to a single file + minimal `node_modules`** | yjs already bundles via tsup; doing the same for cdc and shipping only truly-runtime deps shrinks the image | Med |
| **Single-binary (`node --experimental-sea` / `bun build --compile`)** | Smallest footprint, no `node_modules` at all | High; changes the run model, not worth it for staging |

Practical recommendation for staging/demo:

1. **Add a "lean" build flavor that excludes OpenTelemetry** (a `pnpm` filter or build arg). This is
   the highest-leverage change for a 1 GB box and shrinks both image and resident memory.
2. **Keep Alpine multi-stage** — it's already the right base; don't chase distroless unless you also
   move the healthcheck off `wget`.
3. **Pin `--max-old-space-size`** per service so the small box fails predictably under pressure.
4. Leave single-binary/SEA experiments out — high effort, low marginal benefit versus the OTel and
   instance-type wins.

> Note: the in-container healthcheck (`HEALTHCHECK … wget …` in both Dockerfiles, and the `ingress`
> healthcheck in `compose.yml`) assumes `wget` exists in the image. Any base-image swap that removes
> busybox/wget (distroless) must replace these with a node one-liner, or the reconciler/LB health
> gating breaks.

---

## 7. The resulting cost model: what's shared, what accumulates

Put §2–§6 together and the per-fork bill collapses to **two** line items. Everything else is
either shared once across all forks, or shrinks to near-zero on STARDUST.

| Resource | Scope | Per-fork cost | Notes |
|---|---|---|---|
| VPC + private network | **Shared once** | €0 | One PN already carries DB + LB + all VMs (`network.ts`) |
| Load balancer (LB-S) | **Shared once** | €0 | Host-header routing already fans `api.<fork>` / `www.<fork>` / `yjs.<fork>` |
| yjs VM | **Shared once** (STARDUST + N containers) | ~€0 | One STARDUST1-S (~€0.44/mo) for all forks |
| cdc VM | **Shared once** (STARDUST + N containers) | ~€0 | One STARDUST1-S for all forks (Shape 2) |
| Registry, monitoring | **Shared once** | €0 | — |
| Frontend bucket | Per-fork | ~€0 | S3 storage is cents; or a shared frontend VM |
| Pulumi state bucket | Per-fork | ~€0 | S3 storage is cents |
| **Backend VM** | **Per-fork** | **dominant #1** | Stateless HTTP API; can't share (per-fork auth/routes/migrations) |
| **Managed Postgres** | **Shared once** | **dominant #2** | One instance, schema- or DB-per-fork |

> So the steady-state bill is essentially **one managed Postgres + N backend VMs**, plus a flat,
> shared platform tier (LB + PN + one STARDUST yjs + one STARDUST cdc) that does **not** grow with
> fork count. That is exactly the simplification you're after.

Two further levers on the two remaining costs:

- **The backend VM is the only thing that scales linearly.** It's `DEV1-M` in production because of
  the blue-green double-slot RAM requirement (see §6.1). For **staging/demo forks you can drop it to
  in-place rolling** (the strategy cdc/yjs/ai already use — see
  [INFRA_ARCHITECTURE.md](../infra/INFRA_ARCHITECTURE.md) `serviceMatrix`) and run it on a
  `DEV1-S` or even STARDUST, since a brief restart gap is acceptable for non-production. That makes
  even the per-fork backend cheap. Keep blue-green + `DEV1-M` only for production forks.
- **The managed Postgres is shared, so it's a fixed cost, not a per-fork one.** The whole point of
  §2's pooler + schema/DB-per-fork is that 10 forks ride one `DB-DEV-S`. The pooler (a tiny
  STARDUST container on the shared PN, or co-located on the cdc/yjs box) keeps the connection count
  inside the instance's ceiling. Scale the instance up only when aggregate load — not fork count —
  demands it.

Net: adding a fork costs roughly **one small backend VM + two S3 buckets**, against a flat shared
platform. For demo/staging forks on STARDUST + in-place backend rolls, that marginal cost is a few
euro a month per fork.

---

## 8. Security & isolation notes




- **RLS still applies and is your safety net.** Both Yjs (`data/db.ts`) and the backend
  (`tenant-context.ts`) set `app.tenant_id`. Under Model B, schema + RLS are belt-and-braces;
  under Model C, RLS is the *only* boundary, which is riskier across independent forks.
- **Shared `YJS_SECRET` is acceptable; shared `CDC_SECRET` deserves more thought.** Yjs delegates
  real authz to each fork's backend, so the relay secret is low-stakes. CDC, by contrast, *pushes
  authoritative activity data* to backends — in Shape 1 a fork-routing bug could deliver one
  fork's changes to another fork's backend. Per-fork CDC secrets + a verified `fork` field on
  every WS message are the mitigation.
- **Shared CDC = shared fate.** One slot means one fork's stalled backend produces WAL lag (and
  eventually disk pressure) for everyone (`CDC_WAL_BACKPRESSURE_PLAN.md` becomes a multi-tenant
  concern). Shape 2 (per-fork slots) avoids this entirely.
- **Secrets in cloud-init.** The existing known limitation (secrets readable via
  `InstancesReadOnly`, see `compute.ts` header) now spans forks if they share a VM. A shared
  yjs/cdc VM holds **all** forks' secrets. Acceptable for forks under one owner; not for
  multi-owner isolation.

---

## 9. Recommended path


1. **Adopt the pooler immediately** (PgBouncer/PgCat on the private network). It is required for
   *any* sharing model and is independently valuable. Backends + yjs through the pooler; CDC
   direct.
2. **Pick the Postgres model by your isolation appetite:**
   - Forks under one owner, want max cost saving + simplest ops → **Model A + Shape 2**
     (database-per-fork, one shared CDC VM running N containers, one shared yjs VM running N
     containers). **No service code changes.**
   - Want a single shared yjs/cdc *process* and forks that share an instance closely →
     **Model B** (schema-per-fork) + the §3 Yjs refactor + the §4.1 CDC fan-out refactor.
3. **Split the infra into a platform stack + per-fork stacks** (§5). This is needed for both
   models and is where the bulk of the *infra* work is (`naming.ts` two-axis split, a shared-vs-
   fork module partition).
4. **Do the Yjs token-claim refactor (§3) regardless** — it's small and makes the relay reusable
   whether you run one process or N containers.
5. **Only invest in the §4.1 single-CDC fan-out** once fork count and the desire for a single
   process clearly outweigh the shared-fate risk and the multi-week scope-generalization cost
   (which overlaps heavily with [SYNC_ENGINE_PACKAGING_PLAN.md](./SYNC_ENGINE_PACKAGING_PLAN.md)
   step 2–3).

The single biggest correction to the original framing: **the load balancer is not the Postgres
sharing mechanism** — a connection pooler is — and **the Postgres logical-replication
"one-slot-per-database" rule is what dictates whether a single CDC worker is even possible**
(it requires schema-per-fork, not database-per-fork).
