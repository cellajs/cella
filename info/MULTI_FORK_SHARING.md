# Multi-fork sharing — phased implementation plan

> **Status:** Implementation plan. Phases are independently shippable and ordered by
> risk/leverage — each one delivers value alone, and later phases are gated on real need,
> not assumed. Stop after any phase.
>
> **Goal:** let N forks of this repository share infrastructure by making the stateless
> services **fork-agnostic** — one process accepts traffic from *any* fork/app/repo — instead
> of running a per-fork copy of each. Each fork keeps only what is intrinsically per-fork
> (its backend API, its data), and rides shared, multi-tenant platform services for everything
> else.
>
> Read alongside [ARCHITECTURE.md](./ARCHITECTURE.md), [SYNC_ENGINE.md](./SYNC_ENGINE.md),
> [SYNC_ENGINE_PACKAGING_PLAN.md](./SYNC_ENGINE_PACKAGING_PLAN.md), and
> [infra/INFRA_ARCHITECTURE.md](../infra/INFRA_ARCHITECTURE.md).

---

## Design principle: fork-agnostic processes, not co-located copies

The cost of N forks comes from running a per-fork copy of every service. There are two ways to
collapse that, and this plan deliberately picks the second:

| | **Co-located copies** (rejected) | **Fork-agnostic process** (this plan) |
|---|---|---|
| Shape | N single-tenant containers on one shared VM | **One** multi-tenant process serving all forks |
| Per-fork work | A container + its env/secret per fork | A row in a registry / a token claim |
| Scaling | Linear in fork count (RAM per container) | Flat — one process, scale horizontally on load |
| New fork | Deploy another container profile | Zero deploy (convention/token-derived) or one config row |
| Fit | Stopgap | The real goal — STARDUST-friendly, truly shared |

A service qualifies for fork-agnostic sharing when it is **stateless and isolates per request**
(the fork identity arrives *with the call* — a Host header or a signed token — not baked into the
process env). The frontend proxy and the Yjs relay both qualify almost as-is. CDC is the one
exception (a stateful, per-database replication consumer) and is treated honestly as such in the
final phase.

The throughline: **move fork identity from process env → per-request input.** Once a service reads
"which fork" from the Host header or the token instead of `process.env`, one process serves
everyone and a new fork needs no new process.

---

## Architectural seam (shared platform handles)

Sharing the LB / DB / network still needs the modules that *consume* them to not care whether the
resource was created locally (monolith) or lives in a shared platform stack. Today each shared
handle is a direct sibling import of a `pulumi.Output`:

```ts
// resources/database.ts, resources/compute.ts, resources/loadbalancer.ts
import { privateNetworkId } from './network'
```

The Pulumi property that makes the split clean:

> A `StackReference.getOutput('x')` has the **same type** (`Output<T>`) as a local resource's
> `.id`. Downstream code cannot tell whether the private network was *created here* or *read from
> another stack*.

So the split collapses to one new file, `infra/resources/platform.ts`, resolving shared handles
**either** locally (monolith, the default) **or** from a `StackReference` (split):

```ts
// resources/platform.ts — THE ONLY place the monolith/split branch lives
const platformStack = infraConfig.get('platformStack') // unset = monolith

let privateNetworkId: pulumi.Output<string>
let lbId: pulumi.Output<string>
// …

if (platformStack) {
  const ref = new pulumi.StackReference(platformStack)
  privateNetworkId = ref.requireOutput('privateNetworkId') as pulumi.Output<string>
  lbId = ref.requireOutput('lbId') as pulumi.Output<string>
} else {
  ;({ privateNetworkId } = await import('./network'))
  ;({ lbId } = await import('./loadbalancer'))
}

export { privateNetworkId, lbId /*, … */ }
```

Downstream modules change `from './network'` → `from './platform'` and are otherwise untouched.
The monolith path is **byte-identical** to today, so existing single-fork users see no change. The
split is opt-in via `infra:platformStack`. Same discipline as the compose registry (cella-owned
machinery + one declarative seam), one layer up.

Two supporting pieces:

- **`infra/platform-contract.ts`** — a shared constant listing the platform output names both
  sides agree on, so a renamed output is a typecheck error, not a silent runtime break in forks.
- **Naming gains a second axis** ([naming.ts](../infra/naming.ts)). Split `deriveInfra` into
  `derivePlatform(group)` (shared, **not** slug-prefixed) and `deriveFork(appConfig)`
  (slug-prefixed, as today).

---

## What couples each service to one fork today

Grounding for the phases — the exact code paths and whether each can go fork-agnostic.

### Frontend proxy (`infra/caddy`) — almost generic already ✅

[caddy/Caddyfile](../infra/caddy/Caddyfile) is a **stateless reverse proxy** in front of the SPA's
S3 bucket: it adds the security headers S3/Edge can't, rewrites 404→`/index.html` for deep links,
and proxies to `{$ORIGIN_HOST}`. Its only fork-specific inputs are two env values baked per
process: `ORIGIN_HOST` (the fork's bucket) and `RELEASE_SHA` (bound to `X-App-Version`). Move the
origin from env → **derived from the request Host**, and one proxy serves every fork (Phase 1).

### Yjs relay (`yjs/src`) — three process-level env couplings

| Coupling | Where | Fix to go fork-agnostic |
|---|---|---|
| `YJS_SECRET` | `env.ts`, `server/auth.ts` | Shared relay secret (low-stakes — see below) or per-fork registry |
| `appConfig.backendUrl` | `server/auth.ts` `verifyEntityAccess` | Resolve from a `fork` token claim → `fork → backendUrl` registry |
| `DATABASE_URL` + `yjs_documents` location | `data/db.ts` | `search_path` set per connection from the token claim |

`tenant_id` already isolates rows (token-carried, enforced by RLS in `withClient()`). Nothing in
the relay logic is fork-specific *except* those three env values — move them to per-connection,
token-derived values and one relay serves all forks (Phase 2). The binary hot path is untouched.

### CDC worker (`cdc/src`) — the stateful exception

| Coupling | Where | Why it resists clean multi-tenancy |
|---|---|---|
| `cdc_slot` / `cdc_pub` (global constants) | `constants.ts` | A logical slot is **per-database** — one slot can't stream more than one DB |
| Single `API_WS_URL` | `env.ts`, `compute.ts` | It *pushes* to one backend; multi-tenant needs fan-out |
| Schema assumptions | `services/activity-service.ts`, handlers | Writes to one schema; no fork routing |

CDC is a **push singleton bound to a replication slot**, so it can't isolate "per request" the way
a relay does — there is no request, only a WAL stream. Making it fork-agnostic requires
schema-per-fork + a fan-out refactor (Phase 7), and even then it carries a shared-fate failure
mode. Until that's worth it, CDC stays **per-fork but tiny** (its own STARDUST box / slot), which
is honest about its nature rather than pretending it's stateless.

### Infra (`infra/resources`)

- [naming.ts](../infra/naming.ts) derives every name from `appConfig.slug` → intrinsically single-fork.
- [loadbalancer.ts](../infra/resources/loadbalancer.ts) already does host-header routing and attaches **every** `Backend`/`Route`/`Certificate` by `lbId: lb.id` — so a fork can self-serve its routes against a shared LB.
- [database.ts](../infra/resources/database.ts) provisions one managed Postgres on the private network with `admin`/`runtime`/`cdc` roles and logical replication enabled.

---

## Phase 0 — Prep: the seam, no behaviour change

**Outcome:** the seam exists and the monolith routes through it, byte-identical to today. The
safety net that keeps every later structural phase a ~2-file change.

1. Add `infra/platform-contract.ts` — the list of platform output names (start with
   `privateNetworkId`; grow per phase).
2. Add `infra/resources/platform.ts`. With `infra:platformStack` unset it re-exports the local
   module outputs.
3. Repoint one consumer (e.g. [database.ts](../infra/resources/database.ts)
   `import { privateNetworkId }`) from `./network` to `./platform`.

**Exit criteria:** `pnpm --filter infra ts` clean; `pulumi preview` zero-diff on a real stack; all
infra tests green. **Risk:** minimal (no resource changes).

---

## Phase 1 — Generic frontend origin proxy (the cleanest win)

**Outcome:** **one** shared Caddy proxy fronts the SPA buckets of *all* forks, routing to the
right bucket by request Host. Adding a fork needs **no proxy change**. Per-fork SPA releases stop
rolling a container at all — they become a bucket upload + cache bust.

This is the model you want, in its simplest form: the proxy is stateless and already isolates per
request (the Host header *is* the fork identity). Today it only fails to be generic because
`ORIGIN_HOST` is baked per process.

1. **Derive origin from Host, not env.** Replace the single `{$ORIGIN_HOST}` upstream with a
   mapping `request Host → fork bucket origin`. Two options:
   - **Convention (target):** derive the bucket host from the Host by naming rule (e.g.
     `www.<fork>.<zone>` → `<fork>-frontend.s3.<region>...`). A new fork needs **zero** proxy
     config — pure convention, the truly scalable shape.
     [naming.ts](../infra/naming.ts) already defines `frontendBucket: ${prefix}-frontend`, so the
     rule is just the inverse of existing naming.
   - **Map file (fallback):** a Caddy `map {host}` block (or a hot-reloaded map file) listing
     `host → origin`. Adding a fork updates the map; no redeploy if reloaded.
2. **Decouple `X-App-Version` from the process.** A shared proxy can't bake one `RELEASE_SHA`.
   The SPA bundle already carries its own version; the shared proxy stops *asserting* a single
   version. Per-fork SPA-version verification moves to the frontend deploy job (upload + check a
   `version.json` in the bucket), and the proxy's health gate becomes "proxy is up", not "this
   fork is at SHA X". This is a simplification: **a frontend release no longer needs a container
   roll** — there is nothing per-fork to roll.
3. **Make it a platform service.** Remove `frontend` from the per-fork compose registry
   ([infra/compose/services.config.ts](../infra/compose/services.config.ts)) and run the generic
   proxy once in the platform tier (a STARDUST box behind the shared LB). Fork stacks no longer
   deploy a frontend VM, deploy-tag, or reconciler entry — only their bucket.

**Exit criteria:** two forks' SPAs served correctly through one shared proxy by Host; a new fork
resolves with no proxy change (convention mode); a frontend release is a bucket-only deploy.
**Risk:** low — the proxy is stateless and the change is contained to the Caddyfile + dropping the
frontend service from the per-fork registry. Fully reversible.

---

## Phase 2 — Fork-agnostic Yjs relay

**Outcome:** **one** shared Yjs relay serves every fork. Fork identity arrives in the signed token,
not the process env. STARDUST-friendly; scale horizontally on connection load, not on fork count.

This is the same principle as Phase 1 (fork identity per request), applied to the WebSocket relay.
The relay already isolates rows by `tenant_id` via RLS; only three env values are process-global.

1. **Add a `fork` claim to the Yjs token** (`server/auth.ts` `tokenPayloadSchema`). Each fork's
   backend already mints the token, so it stamps its own identity:
   ```ts
   const tokenPayloadSchema = z.object({
     userId: z.string(), entityType: z.string(), tenantId: z.string(),
     organizationId: z.string().nullable(),
     fork: z.string(), // ◀ NEW: fork/schema identifier
     exp: z.number(),
   })
   ```
2. **Resolve backend + secret per fork.** `verifyEntityAccess()` looks up `fork → { backendUrl,
   secret }` from a small registry (env-provided or Secret Manager). A **shared `YJS_SECRET` is
   acceptable** — the relay secret only gates the handshake; real authorization is still the
   per-fork `verify-entity` backend call, so a shared relay secret does not weaken tenant
   isolation. Per-fork secrets are available if you want tighter blast-radius.
3. **Scope DB access per connection.** `DocContext` carries the fork; `withClient()` sets
   `search_path` (schema-per-fork) or relies solely on `tenant_id` (shared schema) per checkout.
   One `pg.Pool` against the shared instance/pooler is fine — context resets per checkout.
4. **Make it a platform service.** Like Phase 1, the relay moves to the platform tier (one
   STARDUST box behind the shared LB on `yjs.<fork>` hostnames). Fork stacks stop deploying a yjs
   VM.

**Exit criteria:** one relay serves ≥2 forks' documents with correct per-fork backend
verification and row isolation; a new fork needs only a registry row (or nothing, if the registry
is convention-derived). **Risk:** moderate — touches the relay auth/DB-context path (not the
binary hot path); guard with cross-fork isolation tests.

---

## Phase 3 — Share the load balancer

**Outcome:** one LB serves all forks; each fork self-serves its `api.<fork>` / `www.<fork>` /
`yjs.<fork>` routes. Cleanest structural phase because LB children already attach by `lbId`.

1. Export `lbId` (+ frontend/cert handles) from the platform side; add to `platform-contract.ts`.
2. Resolve `lbId` in `platform.ts` (local for monolith, StackReference for split).
3. Move the per-service `Backend`/`Route`/`Certificate` creation in
   [loadbalancer.ts](../infra/resources/loadbalancer.ts) to consume `lbId` from `platform.ts`. In
   split mode these run in the **fork** stack, attaching to the shared LB by ID; host-header
   routing already isolates forks by hostname.
4. Two-axis naming: route/cert/backend names gain the fork prefix; the LB itself is platform-named.

**Exit criteria:** two forks resolve their own hostnames through one shared LB; monolith stacks
unchanged (`pulumi preview` zero-diff). **Risk:** moderate; keep route names fork-prefixed to
avoid collisions on the shared LB.

---

## Phase 4 — Two-axis naming + platform/fork stack partition

**Outcome:** [naming.ts](../infra/naming.ts) cleanly separates shared vs per-fork names, and the
entrypoint can run as a platform stack or a fork stack.

1. Split `deriveInfra` → `derivePlatform(group)` + `deriveFork(appConfig)`. Platform names key on
   a group id (not slug); fork names keep the `${slug}-` prefix.
2. Stack-role switch in [index.ts](../infra/index.ts): `infra:stackRole` ∈ `monolith` (default) |
   `platform` | `fork`. `platform` deploys shared modules + exports the contract; `fork` deploys
   per-fork modules + reads it; `monolith` deploys everything (today).
3. CI ordering: a `fork` `pulumi up` hard-depends on its `platform` stack; fail loudly (via
   `requireOutput`) on a missing platform output.

**Exit criteria:** a platform stack + ≥1 fork stack deploy a working app; a monolith stack still
deploys unchanged. **Risk:** moderate; mechanical but touches every module's resource names — land
it behind the seam so the monolith path is the safety net.

---

## Phase 5 — Connection pooler

**Outcome:** PgBouncer/PgCat on the private network; backends + the shared yjs relay connect
through it, CDC connects direct. Independently valuable (protects the connection ceiling) and
**required** before sharing the DB instance.

A `DB-DEV-S` has a low max-connections ceiling; N forks × (backend pool + yjs pool + cdc) blows
past it. A transaction-mode pooler collapses thousands of client connections onto a small server
pool. **CDC's logical-replication connection must bypass the pooler** (replication can't traverse
transaction pooling) and connect to the instance directly; only normal query traffic uses it.

```
fork-a backend ─┐
fork-b backend ─┤        ┌────────────┐        ┌──────────────────────┐
shared yjs relay┼──TCP──▶│  pooler    │──TCP──▶│ Managed Postgres (1)  │
                │        │ PgBouncer/ │        │  db/schema fork_a      │
shared cdc ─────┼─direct─┤ PgCat      │───────▶│  db/schema fork_b  …   │
(replication)   ┘  (replication bypasses pooler) └──────────────────────┘
```

1. New platform module: a small VM/container running the pooler on the shared private network
   (can co-locate with the shared relay box). Export its private endpoint via the contract.
2. Point backend + yjs at the pooler; leave `DATABASE_CDC_URL` on the instance directly.
3. Per-fork routing by DB role: each fork's role defaults to its own `search_path`/database, so
   the pooler routes purely on the connection string — no app logic.

**Exit criteria:** aggregate connection count under the instance ceiling with ≥3 forks; CDC
replication unaffected. **Risk:** moderate; validate transaction-pooling semantics (no session
state across statements) against the backend's query patterns.

---

## Phase 6 — Share the managed Postgres instance

**Outcome:** one managed Postgres serves all forks. Pick the tenancy model by your CDC ambition:

| Model | Isolation | Single shared CDC *process*? | Schema divergence | Fit |
|---|---|---|---|---|
| **A. Database-per-fork** | Strongest | ❌ No (slot is per-DB) | Free | Per-fork CDC stays (Phase 7 N/A); strongest isolation |
| **B. Schema-per-fork** (one DB) | Strong (schema + RLS) | ✅ Yes (one publication spans schemas) | Free | Required for fork-agnostic CDC (Phase 7) |
| **C. Shared schema, `tenant_id`** | Row-level (RLS only) | ✅ Yes | ❌ All forks identical migrations | Rejected — forks add their own tables |

Forks extend the entity model with their own tables, so **Model C is out**. Choose **B** if you
intend Phase 7 (single shared CDC process); otherwise **A** for the strongest isolation with
per-fork CDC.

1. Split [database.ts](../infra/resources/database.ts): a **platform half** (instance, PN attach,
   HA/backups, instance-wide `max_replication_slots`/`max_wal_senders` sized for fork count + HA
   headroom — note it already sets `sync_replication_slots=on` + `hot_standby_feedback=on`) and a
   **fork half** (a `scaleway.rdb.Database` or schema + per-fork roles, connection-string
   derivation moving fork-side).
2. Export instance handles via the contract; resolve in `platform.ts`.
3. Fork-side migration job creates/owns the fork's database/schema + roles (with the right
   `search_path`/grants) and runs migrations. For Model B it also registers the fork's tables into
   the shared `cdc_pub` publication.
4. Add per-slot `restart_lsn`-lag monitoring — the physical WAL is instance-wide, so a stalled
   fork pins WAL for everyone.

**Exit criteria:** ≥2 forks on one instance, isolated DB/schema each; WAL-lag alerting in place.
**Risk:** high — biggest piece; forces fork-side role/migration ownership. Do it only once shared
DB is genuinely wanted; the prior phases already deliver most of the saving.

---

## Phase 7 — (Optional) Fork-agnostic CDC process

**Outcome:** **one** CDC process serves all forks via fan-out — CDC finally joins the
fork-agnostic tier. Reserve for when fork count is high **and** the
[SYNC_ENGINE_PACKAGING_PLAN.md](./SYNC_ENGINE_PACKAGING_PLAN.md) scope-generalization is done. It
trades isolation for density and introduces a shared-fate failure mode, which is why CDC is last
and optional.

Requires Model B (one DB, schema-per-fork, one `cdc_pub` spanning all schemas, one `cdc_slot`).
Refactors in `cdc/src`:

1. **Resolve fork from each WAL change** — the pgoutput `Relation` message carries the schema
   (namespace); map `namespace → fork`.
2. **Write activities into the correct schema** — `services/activity-service.ts` /
   `create-activity.ts` become schema-qualified (or `search_path`-scoped per transaction).
3. **Fan out to the right backend** — `network/websocket-client.ts` becomes a pool of WS
   connections keyed by fork; `TransactionBuffer` adds `fork` to its grouping key so a batch never
   crosses forks.
4. **De-hardcode identity** — `application_name`/`appConfig.slug` become generic; `CDC_SECRET`
   per-fork (CDC pushes authoritative data — a routing bug must not deliver one fork's changes to
   another's backend).
5. **Per-fork backpressure** — buffer per fork; pause slot-ack only on global buffer pressure, not
   per-backend disconnect, so one unhealthy fork backend doesn't stall the shared slot for all.

**Until Phase 7 (or instead of it):** CDC stays **per-fork but tiny** — its own STARDUST box and
its own slot/database (Model A). This is the honest default: CDC is stateful and per-database, so
a per-fork micro-instance is simpler and safer than forcing it multi-tenant.

**Exit criteria:** one CDC process routes ≥3 forks' changes with no cross-fork leakage and
isolated backpressure. **Risk:** high, multi-week; overlaps heavily with the packaging plan.

---

## Cost model: what's shared, what accumulates

After Phases 1–6 the per-fork bill collapses to **one managed Postgres + N backend VMs (+ a tiny
per-fork CDC until Phase 7)**, plus a flat shared platform tier that does **not** grow with fork
count.

| Resource | Scope | Per-fork cost | Notes |
|---|---|---|---|
| VPC + private network | Shared once | €0 | One PN carries DB + LB + all platform services |
| Load balancer (LB-S) | Shared once | €0 | Host-header routing fans `api.<fork>` / `www.<fork>` / `yjs.<fork>` (Phase 3) |
| Frontend proxy | **Shared once** (generic, Host-routed) | €0 | One STARDUST serves all forks; SPA releases are bucket-only (Phase 1) |
| Yjs relay | **Shared once** (fork-agnostic, token-routed) | €0 | One STARDUST relay serves all forks (Phase 2) |
| Connection pooler | Shared once | ~€0 | Tiny container on the shared platform box (Phase 5) |
| Registry, monitoring | Shared once | €0 | — |
| Frontend bucket | Per-fork | ~€0 | S3 cents |
| Pulumi state bucket | Per-fork | ~€0 | S3 cents |
| **CDC** | Per-fork (tiny) until Phase 7 | small | Own STARDUST + slot; shared process only after Phase 7 |
| **Backend VM** | **Per-fork** | **dominant #1** | Stateless API; per-fork auth/routes/migrations |
| **Managed Postgres** | **Shared once** | **dominant #2** | One instance, DB/schema-per-fork (Phase 6) |

Two levers on the remaining costs:

- **Backend is the main linear cost.** It's `DEV1-M` in production for the blue-green double-slot
  RAM requirement. For staging/demo forks, switch it to **in-place** rolling on a `DEV1-S`/STARDUST
  (a brief restart gap is acceptable) — a per-service field change in
  [infra/compose/services.config.ts](../infra/compose/services.config.ts) plus the instance-type
  override. Keep blue-green + `DEV1-M` only for production forks.
- **Managed Postgres is a fixed cost.** The pooler + DB/schema-per-fork lets ~10 forks ride one
  `DB-DEV-S`; scale only when aggregate load — not fork count — demands it.

Net: once the stateless tier is fork-agnostic, adding a fork costs roughly **one backend VM + a
tiny CDC + two S3 buckets** against a flat shared platform.

---

## Security & isolation notes

- **RLS is the safety net throughout.** Both Yjs (`data/db.ts`) and the backend
  (`tenant-context.ts`) set `app.tenant_id`. Under Model A/B, schema/database + RLS are
  belt-and-braces; Model C (rejected) would make RLS the sole boundary.
- **A shared frontend proxy carries no secret.** It only proxies public SPA assets and adds
  response headers — making it generic does not widen any blast radius.
- **Shared `YJS_SECRET` is acceptable; shared `CDC_SECRET` is not.** Yjs delegates real authz to
  each fork's backend, so the relay secret is low-stakes. CDC *pushes* authoritative activity data,
  so a fork-agnostic CDC (Phase 7) needs per-fork CDC secrets + a verified `fork` field on every
  WS message.
- **Shared CDC = shared fate.** One slot means one fork's stalled backend produces WAL lag (and
  eventually instance-wide disk pressure) for everyone. Per-fork CDC (the default) avoids this;
  Phase 7 reintroduces it and must mitigate via per-fork buffering.

---

## Recommended path

1. **Phase 0 + Phase 1 + Phase 2 first** — the seam, then make the two genuinely stateless
   services (frontend proxy, Yjs relay) fork-agnostic. This is the heart of what you want: one
   process per service serving every fork, STARDUST-sized, scaling on load not fork count. No
   shared DB/LB required yet.
2. **Phase 3 (LB) + Phase 5 (pooler)** when you want one public entry and to protect the
   connection ceiling — both independently valuable.
3. **Phase 4 (naming/stack split) + Phase 6 (shared Postgres)** once sharing the managed Postgres
   is genuinely wanted. Choose Model A (per-fork CDC stays) or Model B (enables Phase 7).
4. **Phase 7 (fork-agnostic CDC)** only at high fork counts and after the packaging-plan scope
   generalization. Until then, CDC is per-fork but tiny — the honest treatment of a stateful,
   per-database service.

Two corrections worth keeping front of mind: **the load balancer is not the Postgres-sharing
mechanism** (a connection pooler is), and **Postgres's one-slot-per-database rule** decides whether
a single CDC *process* is even possible (it needs schema-per-fork, Phase 7) — which is exactly why
CDC is the one service that can't trivially join the fork-agnostic tier the way the frontend proxy
and Yjs relay can.
