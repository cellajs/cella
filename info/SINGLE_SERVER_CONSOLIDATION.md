# Single-server consolidation — running AI, Yjs & CDC inside one backend

> **Status:** Design plan / decision aid. This describes how to support **both** deployment
> shapes from one codebase — it is not a refactor for its own sake.
>
> **Goal (from devs):** deploying a separate server for **CDC**, **Yjs** and **AI** alongside
> the **API** is overwhelming. We want the *same* code to run two ways, chosen by config:
> - **Split (default):** each service in its own process / VM. Scales independently; this is
>   the production shape **and what local development uses**.
> - **Single-VM:** the backend/API process also runs every enabled service in-process — one
>   cheap box for demos, previews and small forks.
>
> The switch is a single `appConfig.singleVM: boolean` (default `false`). When `false`, `MODE`
> selects the one subsystem a process runs (the split). When `true`, `MODE` is ignored and the
> backend boots itself plus every service enabled via `x-service`.
>
> Read alongside [ARCHITECTURE.md](./ARCHITECTURE.md), [SYNC_ENGINE.md](./SYNC_ENGINE.md)
> and [MULTI_FORK_SHARING.md](./MULTI_FORK_SHARING.md). That last doc pushes the *opposite*
> axis (one stateless process serving many forks); this doc is about one process running
> many *subsystems* for a single fork.

---

## TL;DR

- **Two shapes, one codebase.** Default is the **split** (one service per process/VM).
  Setting `appConfig.singleVM = true` collapses every enabled service into the backend
  process. No separate "monolith build" — same image, same code, a config flag chooses.
- **`MODE` stays a single value** naming the one subsystem a process runs
  (`api | ai | yjs | cdc | migrate | …`). This is the per-VM model, the default, and how the
  deployed `ai` service already works ([reusing the backend image](../infra/config/services.config.ts)
  at the same SHA, with `MODE: 'ai-worker'`).
- **Why split is the default — including in development.** Bugs hide more easily when you
  *only ever* run everything in one process: cross-service boundaries, network seams, env
  validation and deploy-lifecycle constraints simply never get exercised. Running split by
  default (dev too) surfaces those early. Single-VM is the convenience escape hatch, not the
  baseline.
- **`singleVM: true` ignores `MODE`** and boots the backend plus every service whose
  `appConfig.services.<x>.enabled` is true — the *same* flag the
  [`x-service`](../backend/src/core/x-routes.ts) route gate already reads per request. No
  per-service `MODE` juggling: enablement is the single source of truth in this mode.
- **AI already proves the model; CDC is the one real constraint.** Folding AI/Yjs in is
  mostly mechanical. CDC holds a single Postgres replication slot, so co-hosting it forfeits
  the API's blue-green deploy — fine for single-VM previews, must stay split in production.

---

## Where the code already is

A lot of the hard part is finished. The three "extra servers" are not independent codebases —
they are **entrypoints that compile against backend source**.

| Service | Package | Shares backend source? | Heavy runtime today | API-side seam (already in the API) |
|---|---|---|---|---|
| **AI** | `ai/` | ✅ fully — shim imports [`backend/src/main.ts`](../backend/src/main.ts) | pg-boss job loop ([`ai-worker-entry.ts`](../backend/src/modules/ai/worker/ai-worker-entry.ts)) | MCP routes mounted in [`routes.ts`](../backend/src/routes.ts), gated `x-service: 'ai'` |
| **CDC** | `cdc/` | ✅ via `#/* → ../backend/src/*` ([tsconfig](../cdc/tsconfig.json)) | logical-replication consumer ([`cdc-worker.ts`](../cdc/src/cdc-worker.ts)) | WS receiver attached to the API server in [`main.api.ts`](../backend/src/main.api.ts) (`cdcWebSocketServer.attachToServer`) |
| **Yjs** | `yjs/` | partial — aliases `#/*` but only imports `shared` today | WebSocket relay ([`ws-server.ts`](../yjs/src/server/ws-server.ts)) | Yjs token route mounted in [`routes.ts`](../backend/src/routes.ts), gated `x-service: 'yjs'` |

Two structural facts make consolidation tractable:

1. **`MODE` already exists** and branches the boot in
   [`backend/src/main.ts`](../backend/src/main.ts):
   ```ts
   if (env.MODE === 'migrate')        await import('./main.migrate');
   else if (env.MODE === 'ai-worker') await import('./main.ai-worker');
   else                               await import('./main.api');
   ```
   It is a single enum (`'api' | 'ai-worker' | 'migrate'`,
   [env.ts](../backend/src/env.ts)). **`MODE` stays single-valued** — naming the one
   subsystem a process runs. We extend the enum (e.g. `yjs`, `cdc`) rather than turning it
   into a set; the "run several at once" case is handled by `singleVM`, not by `MODE`.

2. **Service enablement is already a first-class config axis.**
   [`appConfig.services`](../shared/config/config.default.ts) carries
   `{ frontend, backend, cdc, yjs, ai }.enabled`, and the
   [`x-service`](../backend/src/core/x-routes.ts) route gate reads it **per request**, so a
   disabled service's routes 404 without being unmounted (keeping OpenAPI/SDK output stable).
   `cdc/yjs/ai` workers also self-check the same flag and no-op when disabled. **In
   `singleVM` mode this same flag decides what boots in-process** — no new switch to learn.

So the question is **not** "can the routes live on the API" (they do) — it's **"can the three
heavy worker runtimes boot inside the backend process when `singleVM` is on, while staying
independently deployable when it's off?"**

---

## The two shapes

One codebase, one image, two ways to run — chosen by `appConfig.singleVM`.

### Shape 1 — split (default, `singleVM: false`)

Each process runs exactly one subsystem, chosen by `MODE`. This is the production shape and the
**development** shape.

- `MODE=api` → API serves HTTP (plus the already-mounted, gated service routes).
- `MODE=ai-worker` → AI pg-boss job loop only.
- `MODE=yjs` / `MODE=cdc` → (new enum values) the Yjs relay / CDC replication consumer only.
- `MODE=migrate` → one-shot migration, then exit.
- Production and dev both run the **same image** with a different `MODE` per VM/process —
  exactly how the `ai` service already works today
  ([services.config.ts](../infra/config/services.config.ts) sets `MODE: 'ai-worker'`,
  `reusesImageOf: 'backend'`).

### Shape 2 — single-VM (`singleVM: true`)

The backend/API process **ignores `MODE`** and boots itself plus every service whose
`appConfig.services.<x>.enabled` is true (the same flag `x-service` reads). One process, one VM:
the API serves HTTP and the enabled AI/Yjs/CDC runtimes start in-process. This is the cheap box
for demos, previews and small forks.

```ts
// conceptual — backend/src/main.ts
if (appConfig.singleVM) {
  // MODE is ignored; enablement is the only switch
  await startApi();                                       // always
  if (appConfig.services.ai.enabled)  await startAi();
  if (appConfig.services.yjs.enabled) await startYjs();
  if (appConfig.services.cdc.enabled) await startCdc();    // see CDC caveat below
} else {
  // split: one subsystem per process, chosen by MODE
  switch (env.MODE) {
    case 'migrate':   await import('./main.migrate'); break;
    case 'ai-worker': await import('./main.ai-worker'); break;
    case 'yjs':       await import('./main.yjs'); break;
    case 'cdc':       await import('./main.cdc'); break;
    default:          await import('./main.api');
  }
}
```

Each subsystem is just a `start()/stop()` pair the backend can call directly — no heavyweight
registry required. The only metadata that matters operationally is "does this subsystem own the
replication slot?" (CDC), because that gates whether single-VM can blue-green.

### Why this is mostly already true for AI

[`ai-worker-entry.ts`](../backend/src/modules/ai/worker/ai-worker-entry.ts) already: checks
`appConfig.services.ai.enabled`, mounts routes on the shared `baseApp`, starts pg-boss, and
registers a graceful-shutdown handler. That is exactly a `start()` in all but name — it just
happens to own its own `serve()` call. Calling it from the backend process (single-VM) instead
of from its own entrypoint (split) is a small, contained change.

---

## Pros

- **One package, one image, one mental model.** Devs build/run/debug a single thing. The
  `cdc/` and `yjs/` packages collapse to thin shims (like `ai/`), removing three parallel
  `env.ts`, `lib/pino`, `lib/tracing`, `tsup.config.ts` and `Dockerfile` copies that drift
  independently today.
- **Cheapest possible pre-production footprint.** One VM instead of four. Directly answers the
  "overwhelming to deploy" complaint, and dovetails with
  [MULTI_FORK_SHARING.md](./MULTI_FORK_SHARING.md)'s STARDUST-sized boxes for demo/staging
  forks.
- **No code fork between "small" and "scaled".** Single-VM is a config flag, not a separate
  build; the split is just `MODE` per VM. Same image either way — the proven property of the
  AI path already in production config.
- **Shared lifecycle primitives already exist.** `setupGracefulShutdown` from
  [`shared/worker-lifecycle`](../shared/src/), `waitForBackend`, and the OTel wrapper are
  already used identically by all four entrypoints, so a registry can own them once.
- **Type coupling already paid for.** CDC compiles against `#/tables`, `#/db/db`,
  `#/modules/activities/...` today. Co-locating removes a *runtime* boundary that the
  *type* system already treats as one project.

---

## Cons, frictions & risks

The frictions are real and differ sharply per subsystem. The headline: **two of the three
runtimes are stateful in ways that resist naive co-location.**

### 1. CDC's replication slot vs. the API's deploy strategy — the hard one

CDC holds a **single PostgreSQL logical-replication slot**. That is why its deploy strategy is
`replacementStrategy: 'exclusive'` ([services.config.ts](../infra/config/services.config.ts)) —
two live consumers would double-consume the slot. The **API**, by contrast, deploys
`lb-overlap` (blue-green): two generations run simultaneously during cutover.

> **If CDC runs inside the API process, the API can no longer blue-green.** A second API
> generation would mean two CDC consumers contending for one slot — exactly what `exclusive`
> exists to prevent.

Mitigations (pick one, none free):
- **Single-VM uses in-place/exclusive deploys** (a brief restart gap). Acceptable for
  pre-production, which is the whole point of single-VM mode. Document that co-hosting CDC
  forfeits zero-downtime API rollout.
- **Even with `singleVM: true`, keep `services.cdc.enabled` OFF for production-shaped boxes**,
  so only dev/staging single VMs co-host CDC. Production keeps CDC split onto its own
  `exclusive` VM.
- Mark CDC as the slot owner; a boot-time assertion **refuses to start** if `singleVM` would
  co-host CDC alongside an overlap (blue-green) deploy strategy. Fail loud, not silent.

CDC also has its own health server on a separate port
([cdc-worker.ts](../cdc/src/cdc-worker.ts), `CDC_HEALTH_PORT`) and a back-pressure path that
pauses slot-ack under buffer pressure — co-location must route its health through the shared
`/health` and keep its event loop from being starved by API request load.

### 2. Yjs is a binary WebSocket hot path with its own scaling curve

The Yjs relay ([ws-server.ts](../yjs/src/server/ws-server.ts)) is a long-lived WebSocket server
with `maxPayload` tuning, per-connection CRDT state, and its own idle/ping timers. It scales on
**concurrent connections**, the API scales on **request rate** — co-hosting couples two
unrelated capacity curves on one VM's RAM and event loop. A document-editing spike now competes
with API latency. Mitigations: keep Yjs trivially splittable back out (it already is — separate
port `4002`, `lbWebsockets: true`, `drainPolicy: 'reconnect'`), and only co-host it in the
single-VM profile.

### 3. Dependency & image bloat

Folding everything into the backend image pulls `pg-logical-replication`, `pg-format`, the Yjs
CRDT stack, BlockNote server utils, etc. into **every** backend container — including pure-API
production VMs that don't use them. Today each worker image carries only its own deps. Mitigations:
- **Dynamic `import()` per subsystem** (the pattern `main.ts` already uses) so unselected
  subsystems are never loaded into memory, even if present in the image.
- Accept a larger shared image as the cost of one build — usually fine, but measure cold-start
  and RAM on the smallest instance type.

### 4. Env validation becomes all-or-nothing

[env.ts](../backend/src/env.ts) hard-requires `YJS_SECRET`, `CDC_SECRET`, `PII_HASH_SECRET`
etc. *unconditionally*. A backend that can run as API-only (split, `MODE=api`) would now demand
Yjs/CDC secrets it doesn't use. Mitigation: make secret requirements **conditional on what will
actually boot** (zod `superRefine` keyed off `singleVM` + `services.*.enabled` in single-VM, or
`MODE` in split), so `MODE=api` doesn't require `YJS_SECRET`. This is a prerequisite, not an
afterthought.

### 5. Shared-fate blast radius

One process = one crash domain. An unhandled rejection in the CDC pipeline or an OOM from a Yjs
spike takes the API down with it. Today a CDC crash leaves the API serving. Mitigation: this is
**acceptable for pre-production** (the target of single-VM mode) and **unacceptable for
production**, which keeps the split. Single-VM boot should isolate each subsystem's failures
(catch + restart the subsystem, not the process) where feasible.

### 6. Observability / OTel resource identity

Each worker today reports a distinct OTel `service.name` and has its own tracing init. Merged,
they share one process — dashboards/alerts keyed on per-service resources blur. Mitigation: tag
spans/metrics with a `subsystem` attribute and keep one OTel SDK init in the backend process
rather than four.

### 7. Migrations & boot ordering

Already handled and worth preserving: the API owns migrations (`RUN_MIGRATIONS_ON_BOOT`,
`MODE=migrate` one-shot), and workers `waitForBackend` before starting. In single-VM the
ordering is internal — the backend must run the migrate/role step **before** starting CDC
(which needs the publication/slot) and before Yjs/AI touch the DB.

---

## Friction-by-subsystem summary

| Concern | AI | Yjs | CDC |
|---|---|---|---|
| Routes already on API & gated | ✅ | ✅ (token route) | ✅ (WS receiver) |
| Heavy runtime to fold in | pg-boss loop | WS relay | replication consumer |
| Statefulness | low (queue) | medium (CRDT/connections) | **high (single slot)** |
| Blocks API blue-green if co-hosted | no | no | **yes** |
| Separate port today | shares (4003) | 4002 | health 4001 + WS push |
| Scaling axis vs API | similar | **connections** | WAL throughput |
| Co-host in single-VM dev | ✅ easy | ✅ ok | ⚠️ in-place deploy only |
| Keep split in production | optional | recommended | **required** |

---

## Recommended path

1. **Add `appConfig.singleVM: boolean` (default `false`)** and branch boot in
   [`main.ts`](../backend/src/main.ts): when `false`, today's `MODE` switch (extended with
   `yjs`/`cdc` values); when `true`, ignore `MODE` and boot the API plus every
   `services.<x>.enabled` subsystem in-process. Default `false` keeps split as the baseline —
   for production **and** development.
2. **Extract each worker's runtime into a `start()/stop()` pair** the backend can call directly.
   AI is already 90% there ([`ai-worker-entry.ts`](../backend/src/modules/ai/worker/ai-worker-entry.ts));
   it just needs to stop owning its own `serve()`. No heavyweight registry — plain functions.
3. **Make env validation conditional on what boots.** `MODE=api` (split) and a `singleVM` box
   with Yjs/CDC disabled must not require `YJS_SECRET` / `CDC_SECRET`. Prerequisite for one
   binary that can run any subset.
4. **Fold Yjs in.** It only depends on `shared` today and already aliases `#/*` to backend;
   exposing its relay as a `start()` (own port, gated by `services.yjs.enabled`) is mechanical.
   Keep it splittable back out unchanged via `MODE=yjs`.
5. **Fold CDC last, behind a guard.** Mark it the slot owner; refuse to co-boot it under
   `singleVM` alongside an overlapping (blue-green) API deploy. Keep `services.cdc.enabled`
   **off** for production-shaped single VMs, **on** for dev/staging. Route its health through
   `/health`.
6. **Collapse `cdc/` and `yjs/` to thin shims** (like `ai/`) once their runtimes live in the
   backend, deleting the duplicated env/otel/build/Dockerfile copies. Split deploys keep
   working by setting `MODE` per VM on the **one** backend image (the `ai` service already
   proves this end-to-end).

**Single-VM is the escape hatch, not the default.** Default `singleVM: false` means dev and
prod both run split, so cross-service and deploy-lifecycle bugs surface early. Flip the flag for
a cheap one-box preview; keep CDC split in production because its slot constraint trades away
zero-downtime API deploys.

---

## Relationship to MULTI_FORK_SHARING.md

These two plans are orthogonal axes and compose cleanly:

- **This doc (vertical):** one process runs *many subsystems* for *one* fork — fewer VMs per
  fork.
- **[MULTI_FORK_SHARING.md](./MULTI_FORK_SHARING.md) (horizontal):** one process serves *one
  subsystem* for *many* forks — fewer VMs across forks.

A fully realised setup could run a fat single-VM backend (this doc) for cheap forks, while heavy
shared subsystems (frontend proxy, Yjs relay) run fork-agnostic and shared (that doc). The
`MODE`-as-subsystem-set seam here and the platform/fork seam there are independent and can land
in either order.
