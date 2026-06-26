# Single-server consolidation — running AI, Yjs & CDC inside one backend

> **Status:** Analysis / decision aid. No code change is proposed here yet — this
> documents where the codebase already is, what "fold everything into one backend"
> would actually take, and the frictions/risks worth knowing before committing.
>
> **Question (from devs):** deploying a separate server for **CDC**, **Yjs** and **AI**
> alongside the **API** is overwhelming. Can they all run inside a single backend, where
> a `MODE`/config switch decides how it spins up — so the same code can run as one VM
> (cheap, pre-production) *or* as separate VMs (scaled, production)?
>
> Read alongside [ARCHITECTURE.md](./ARCHITECTURE.md), [SYNC_ENGINE.md](./SYNC_ENGINE.md)
> and [MULTI_FORK_SHARING.md](./MULTI_FORK_SHARING.md). That last doc pushes the *opposite*
> axis (one stateless process serving many forks); this doc is about one process running
> many *subsystems* for a single fork.

---

## TL;DR

- **AI is already done.** The `ai/` package is a 12-line shim that sets `MODE=ai-worker`
  and imports the backend's `main.ts`. All AI code lives in `backend/src/modules/ai/`, and
  the deployed `ai` service [reuses the backend image](../infra/config/services.config.ts)
  at the same SHA. This is the exact pattern the question asks to generalise.
- **The HTTP seams of every service already live in the API process and are config-gated.**
  The Yjs token route, the MCP/AI routes, and the CDC WebSocket receiver are all mounted on
  the API today and 404 / no-op when their `appConfig.services.<x>.enabled` flag is off (via
  the [`x-service`](../backend/src/core/x-routes.ts) gate). "Make the routes available on the
  main API by config" is **already the behaviour** — flip the flag.
- **What is *not* co-located is the three stateful worker runtimes:** the Yjs WebSocket
  relay, the CDC logical-replication consumer, and the AI pg-boss job loop. Folding those
  into one process is feasible and mostly mechanical for AI/Yjs, but **CDC carries a real
  deploy-lifecycle constraint** (a single replication slot can't survive a blue-green
  overlap) that must be respected, not papered over.
- **Recommended shape:** make `MODE` a *set* of subsystems (`MODE=api,ai,yjs,cdc`) resolved
  through a small in-process **subsystem registry**, default the single-VM/dev profile to
  "all", and keep the per-VM split as just a different `MODE` value. Gate the CDC subsystem
  so it can only co-reside with an **in-place** (non-overlapping) deploy.

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
   [env.ts](../backend/src/env.ts)). Generalising it to a *set* is the central change.

2. **Service enablement is already a first-class config axis.**
   [`appConfig.services`](../shared/config/config.default.ts) carries
   `{ frontend, backend, cdc, yjs, ai }.enabled`, and the
   [`x-service`](../backend/src/core/x-routes.ts) route gate reads it **per request**, so a
   disabled service's routes 404 without being unmounted (keeping OpenAPI/SDK output stable).
   `cdc/yjs/ai` workers also self-check the same flag and no-op when disabled.

So the question is **not** "can the routes live on the API" (they do) — it's **"can the three
heavy worker runtimes be booted inside the same process, selectable by config?"**

---

## The proposal: `MODE` as a composable subsystem set

Replace the single-value `MODE` with a resolved **set of subsystems**, and introduce one small
in-process registry that each subsystem registers with. The process boots exactly the
subsystems its `MODE` selects.

```ts
// conceptual — backend/src/core/subsystems.ts
type Subsystem = {
  name: 'api' | 'ai' | 'yjs' | 'cdc';
  needsHttpServer?: boolean;     // mounts routes on the shared Hono app
  ownsReplicationSlot?: boolean; // CDC — affects allowed deploy strategy
  start(ctx: BootContext): Promise<Stoppable>;
};
```

- `MODE=api` → today's behaviour (API + already-mounted gated routes).
- `MODE=ai-worker` → today's behaviour (AI job loop only).
- `MODE=all` (or `MODE=api,ai,yjs,cdc`) → **one process**, one VM: API serves HTTP, and the
  AI/Yjs/CDC runtimes start in-process. This is the "cheap pre-production single VM" the devs
  want.
- Production keeps splitting by deploying the **same image** with different `MODE` values per
  VM — exactly how the `ai` service already works
  ([services.config.ts](../infra/config/services.config.ts) sets `MODE: 'ai-worker'`,
  `reusesImageOf: 'backend'`).

`appConfig.services.<x>.enabled` stays the **capability** switch (is this feature part of the
app at all); `MODE` becomes the **placement** switch (which process runs it). A subsystem boots
only when it is both *enabled* and *selected by MODE*.

### Why this is mostly already true for AI

[`ai-worker-entry.ts`](../backend/src/modules/ai/worker/ai-worker-entry.ts) already: checks
`appConfig.services.ai.enabled`, mounts routes on the shared `baseApp`, starts pg-boss, and
registers a graceful-shutdown handler. That is a subsystem in all but name — it just happens to
own its own `serve()` call. Refactoring it to *register* with a process that may also be running
the API is a small, contained change.

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
- **No code fork between "small" and "scaled".** The split deployment is just a different
  `MODE`; there is no separate "monolith build". This is the proven property of the AI path
  already in production config.
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
- **Single-VM profile uses in-place/exclusive deploys** (a brief restart gap). Acceptable for
  pre-production, which is the whole point of the single-VM mode. Document that co-hosting CDC
  forfeits zero-downtime API rollout.
- **Keep CDC selectable but default it OFF in `MODE=all` for production-shaped deploys**, so
  only dev/staging single VMs co-host it. Production keeps CDC on its own `exclusive` VM.
- The subsystem registry marks CDC `ownsReplicationSlot: true`; a boot-time assertion **refuses
  to start** if CDC is selected alongside an overlap deploy strategy. Fail loud, not silent.

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
etc. *unconditionally*. A unified process that can run as API-only would now demand Yjs/CDC
secrets it doesn't use. Mitigation: make secret requirements **conditional on the resolved
subsystem set** (zod `superRefine` keyed off `MODE`/`services`), so `MODE=api` doesn't require
`YJS_SECRET`. This is a prerequisite, not an afterthought.

### 5. Shared-fate blast radius

One process = one crash domain. An unhandled rejection in the CDC pipeline or an OOM from a Yjs
spike takes the API down with it. Today a CDC crash leaves the API serving. Mitigation: this is
**acceptable for pre-production** (the target of single-VM mode) and **unacceptable for
production**, which keeps the split. The registry should isolate each subsystem's failures
(catch + restart the subsystem, not the process) where feasible.

### 6. Observability / OTel resource identity

Each worker today reports a distinct OTel `service.name` and has its own tracing init. Merged,
they share one process — dashboards/alerts keyed on per-service resources blur. Mitigation: tag
spans/metrics with a `subsystem` attribute and keep one OTel SDK init in the registry rather
than four.

### 7. Migrations & boot ordering

Already handled and worth preserving: the API owns migrations (`RUN_MIGRATIONS_ON_BOOT`,
`MODE=migrate` one-shot), and workers `waitForBackend` before starting. In a single process the
ordering is internal — the registry must run the migrate/role step **before** starting CDC
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

1. **Generalise `MODE` to a subsystem set + add a tiny subsystem registry.** Resolve
   `MODE=all` (or comma-list) into the set of subsystems to boot; each subsystem exposes
   `start()/stop()` and metadata (`needsHttpServer`, `ownsReplicationSlot`). Refactor the
   existing AI worker entry to *register* instead of owning its own `serve()`. Low risk — AI is
   already 90% of this shape.
2. **Make env validation subsystem-conditional.** `MODE=api` must not require `YJS_SECRET` /
   `CDC_SECRET`. Prerequisite for a single-binary that can run any subset.
3. **Fold Yjs into the registry.** It only depends on `shared` today and already aliases
   `#/*` to backend; moving its relay under the registry (its own port, gated by
   `services.yjs.enabled` + MODE) is mechanical. Keep it splittable back out unchanged.
4. **Fold CDC last, behind a guard.** Mark it `ownsReplicationSlot`; refuse to co-boot it with
   an overlapping API deploy strategy. Default it **off** in production-shaped `MODE=all`, **on**
   for dev/staging single VMs. Route its health through `/health`.
5. **Collapse `cdc/` and `yjs/` to thin shims** (like `ai/`) once their runtimes live in the
   backend, deleting the duplicated env/otel/build/Dockerfile copies. Production deploys keep
   splitting by setting `MODE` per VM on the **one** backend image (the `ai` service already
   proves this works end-to-end).

**Stop after step 3 if that's enough** — AI + Yjs in one VM already removes two of the three
"extra servers", and CDC's slot constraint makes it the only one where co-location trades away
zero-downtime API deploys. Treat CDC as opt-in, and the single-VM/dev win is captured without
compromising the production rollout story.

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
