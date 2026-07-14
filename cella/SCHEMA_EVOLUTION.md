# Schema evolution implementation plan (doba lenses)

> **Status**: Implementation plan + code-verified checklist (audited 2026-07-06 on `cella/sync/20260706-1233`, upstream cella `4355336`). Supersedes the earlier cache-busting research doc (deleted with the `info/` folder; see git history).
> Mechanism: version-tolerant API boundary + local cache migration, built on [doba](https://github.com/karol-broda/doba) (`dobajs`) as the transform/registry engine.
> Related: [Sync engine](/docs/page/architecture/sync-engine), [Architecture](/docs/page/architecture).
>
> **Fork context (raak)**: raak is currently the maintained superset of upstream cella; schema-evolution work continues here and is contributed back upstream. Upstream wires its own product entities (`attachment`, `page`); the fork owns the seam wiring for `task`/`label` and any future fork entities — see the ❌ items in the checklist.
>
> **Doc housekeeping**: this file is committed and published on the docs site (Architecture → Schema evolution). The synced docs (AGENTS.md, SYNC_ENGINE.md, ARCHITECTURE.md) point here for the shipping playbook, so: write the playbook section before lens #1.

---

## Cache-bust (interim)

The full lens system below is **wired and live with an empty lens list** (every seam is a passthrough no-op — see Status audit). Until the first lens ships and proves itself, breaking schema changes are handled by a simpler, throwaway escape hatch:

1. **`appConfig.clientCacheVersion`** ([shared/config/config.default.ts](../shared/config/config.default.ts)) — a string token, colocated with `apiVersion`/`cookieVersion` in the VERSIONING section. Bump it (e.g. `'v1' → 'v2'`) in the **same PR** as any breaking change to a cached entity's wire shape.
2. **Client wipe, mutations preserved** — on boot, [frontend/src/query/persister.ts](../frontend/src/query/persister.ts) compares the persisted version to `appConfig.clientCacheVersion`. On mismatch it wipes cached query data (product records + bundled context queries) but **keeps queued mutations**, which replay against the fresh cache. A missing version (pre-feature build) seeds without wiping. Session scopes are wiped wholesale.
3. **Mutation salvage (Level 0)** — kept mutations replay; any that 4xx are quarantined to the `failed_sync` Dexie table ([frontend/src/query/offline/failed-sync.ts](../frontend/src/query/offline/failed-sync.ts)) rather than dropped (non-blocking, JSON-exportable). Level 1 (field-level strip against the current request schema) is a future tightening.
4. **CI gate** — `schema-bust-gate` in [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs oasdiff on the committed `backend/openapi.cache.json` (base vs head). A breaking diff **fails the PR** unless `clientCacheVersion` was bumped in the same PR. Couple with a `feat!` PR title so release-please cuts a major. The gate is PR-time only — it never blocks the release/deploy jobs.

**Teardown**: when lenses are stable, delete `appConfig.clientCacheVersion`, the persister bust branch, the `failed_sync` quarantine, and the `schema-bust-gate` job; wire the lens engine in its place. No entanglement — the cache-version mechanism and the lens engine are independent.

---

## Status audit

What exists vs. this plan, code-verified 2026-07-06 on the sync branch. Legend: `[x]` verified in code · `[ ]` not done — ❌ needs action before/at this merge, ⬜ deliberate deferral. Landscape research (Cambria, panproto, doba, local-first engines) summarized under [Prior art](#prior-art).

### Done — wired and live (all passthrough while the lens list is empty)

- [x] **1.1 Engine + convention** — [define.ts](../shared/src/schema-evolution/define.ts) (5 delta kinds, `defineLens` validation, `LENS_FORMAT_VERSION`, `resolveAddDefault` default-as-function), [engine.ts](../shared/src/schema-evolution/engine.ts) full facade (`normalizeOps` incl. `unknownFieldHandling` enforcement, `migrateCachedEntity`, `migrateQueuedMutation`, `downgradeEntity` (zero callers — Phase 2), `currentSchemaVersion = lenses.length`, `versionNodeFor`, `configureLensTelemetry`), [config.ts](../shared/src/schema-evolution/config.ts) (`expandWindowMinDays: 14`, `staleBundleMaxDays: 30`, `unknownFieldHandling: 'strip'`), empty [lens-list.ts](../shared/src/schema-evolution/lens-list.ts). `dobajs@0.1.0` is a real dependency, imported only by engine.ts.
  - Naming drift vs. §1.1: the actual export is `widenedOpsKeyMap(entityType): Record<old, new>` — call sites build the widened Zod schemas from it; `widenedOpsSchema` does not exist.
  - Pin drift: doba is pinned exact in `shared/package.json`, not in the `pnpm-workspace.yaml` catalog as §Why doba prescribes.
- [x] **1.0 Telemetry chain** — `X-Client-Version` on every SDK request ([api-client.ts](../frontend/src/lib/api-client.ts)); [client-version.ts](../backend/src/middlewares/client-version.ts) mounted `app.use('*', …)` — **all routes, not just product routes** → `schema.client_version.seen` otel counter ([schema-version-metrics.ts](../backend/src/lib/schema-version-metrics.ts)); [lens-telemetry.ts](../backend/src/lib/lens-telemetry.ts) doba hooks.
- [x] **1.2 Server seams** — `createUpdateSchema(entityType, shape)` widens ops schemas with expand aliases; [lens-seam.ts](../backend/src/core/schema-evolution/lens-seam.ts) adds `widenBodySchema` + `normalizeCreateItem` for the create path; `resolveUpdateOps(entityType, …)` calls `normalizeOps` centrally so entity modules can't forget it. **Wired for `attachment` + `page` only** — see ❌ below.
- [x] **1.4 Client boot migration** — [persister.ts](../frontend/src/query/persister.ts) `migrateScopeToCurrent` — persisted `schemaVersion` meta field (NOT the RQ `buster` slot, which round-trips through PersistQueryClientProvider and must stay `''`), chunked rewrites (200/txn) via [cache-migration.ts](../frontend/src/query/cache-migration.ts), pointer advanced atomically in the final meta write, Web-Lock mutual exclusion across tabs, session scopes wiped on mismatch. Covered by [boot-migration.test.ts](../frontend/src/query/tests/boot-migration.test.ts) (6 scenarios). Pointer-ahead semantics: see "Multi-tab guard" below.
- [x] **1.7 core — multi-tab guard** — see subsection below.
- [x] **1.5/1.6 Mutation replay + backstop** — mutations rewritten on disk in the same transaction chain as the pointer; migrations idempotent by construction; failed replays quarantined to the `failed_sync` Dexie table ([failed-sync.ts](../frontend/src/query/offline/failed-sync.ts)).
- [x] **Interim escape hatch** — `clientCacheVersion: 'v1'` in config.default.ts, persister bust-keep-mutations branch, `schema-bust-gate` oasdiff CI job. Stays as backstop until lens #1 survives production.
- [x] **`lens:check` script** — [shared/scripts/check-lenses.ts](../shared/scripts/check-lenses.ts): append-only (first-commit blob compare), config-collision vs. reserved frozen-envelope/CDC/embedding fields, contract-requires-prior-expand, purity regex. Wired into root `pnpm check` — but see ❌ below.

### Fixed on this sync branch (2026-07-06) ✅

- [x] **Unified evolution-contract factory built and all 7 entities wired** — `evolutionContract.product` / `evolutionContract.context` in [backend/src/core/schema-evolution/evolution-contract.ts](../backend/src/core/schema-evolution/evolution-contract.ts); see [Design revision](#design-revision) for the as-built API. Subsumed the task/label regression fix (the sync had left them on pre-lens single-argument `createUpdateSchema({…})` calls, collapsing `zUpdateTaskBody.ops`/`zUpdateLabelBody.ops` to `z.record(z.string(), z.unknown())` and failing typecheck). The regenerated SDK is byte-identical to the pre-sync contract.
- [x] **1.10 context-entity coverage (Tier 2) implemented** — `LensDefinition.entityType` widened to `LensEntityType` (product | context); organization/workspace/project register via `evolutionContract.context` (widened create + partial-update bodies, `normalizeBody` at the top of each create/update operation); client `entityTypeOf` recognizes context types, so the existing `contextQueries` + mutation migration walk now actually migrates them.
- [x] **`lens:check` runs in CI** — step added to the lint job (with `fetch-depth: 0` for the append-only guard), plus a new rule 4: **contract completeness** — every configured product/context entity type must call its contract factory in `backend/src/modules`, so a fork entity can never silently miss the seams again.

### Gaps — still open (❌)

- [ ] ❌ **oasdiff gate lacks the "or a lens module was added" pass condition** — the only escape is a `clientCacheVersion` bump. (AGENTS.md already claims the lens escape exists — doc drift.) Needed before lens #1, or shipping a lens forces a pointless cache bust.
- [ ] ❌ **The shipping playbook was never written** — see [Shipping a lens: playbook](#lens-playbook). The synced docs point at this file for it.

### Deferred — known and deliberate (⬜)

- [ ] ⬜ `droppedFields` old-alias emission (1.3).
- [ ] ⬜ Staleness deadline: the `staleBundleMaxDays` knob exists in config.ts but has zero consumers; forced idle-gated reload unbuilt. Nice-to-have — the persist guard already blocks stale writes.
- [ ] ⬜ Versioned OpenAPI specs (D5/2.1) — no replay logic in generate-openapi.ts.
- [ ] ⬜ `GET /versions`, `Accept-Version`, `downgradeEntity` call sites (2.2).
- [ ] ⬜ Server `failed_mutations` DLQ (2.4).
- [ ] ⬜ `contractedLenses` mechanism (contract-phase bookkeeping; name only, no code anywhere).
- [ ] ⬜ CLI diff→lens derivation (future assist).

### Multi-tab guard (1.7 core) — wired 2026-07

- **Schema-version broadcast**: [tab-coordinator.tsx](../frontend/src/query/realtime/tab-coordinator.tsx) announces `currentSchemaVersion` on the existing BroadcastChannel at init; a tab seeing a *higher* version marks itself stale, a tab seeing a *lower* one re-announces so late-booting old tabs learn.
- **Persist guard**: [schema-version-guard.ts](../frontend/src/query/schema-version-guard.ts) + [persister.ts](../frontend/src/query/persister.ts) — a stale bundle never writes; the flush path also checks the on-disk pointer directly (broadcast can race the first write).
- **Pointer-ahead semantics changed from the original plan**: disk ahead of bundle now means *mark stale, restore nothing, never write* — NOT "backward-migrate or wipe". The common case is a stale tab beside a newer tab (a wipe would destroy the newer tab's migrated cache); a genuine rollback deploy is rare, is a no-op within an expand window, and recovers on the next forward deploy. PWA update flow (reload-prompt) replaces the stale bundle.
- **Correction to this doc**: PWA update detection already exists — [reload-prompt.tsx](../frontend/src/modules/common/reload-prompt.tsx) polls every 15 min + on visibility/online and shows the refresh prompt; `sw.ts` needed nothing. Still open from 1.7: the *forced* staleness deadline (`schemaEvolutionPolicy.staleBundleMaxDays`, idle-gated) — nice-to-have, not safety-critical now that the guard blocks stale writes.

### Activation path

1. ~~**Wire the free telemetry chain**~~ (1.0/1.9) — **done 2026-07**. Fleet-floor data collects from the next deploy.
2. ~~**Build the two missing mechanical pieces**~~ (schema widening + boot-migration pass) — **done 2026-07**, see "Wired and live" above. `clientCacheVersion` kept as backstop.
3. ~~**Multi-tab persist guard (1.7 core)**~~ — **done 2026-07**, see above.
4. **Lens #1: decided 2026-07 — no permanent rehearsal lens.** Renaming a field purely as a rehearsal pollutes the API forever (lens modules are append-only), and the natural candidate `attachment.name` turned out to be a shared `productEntityColumns` base column — renaming it on one entity would diverge from the template convention. Instead: the machinery stays fully wired and passthrough; rehearse via a **branch-local lens** (see [playbook](#lens-playbook)) and ship lens #1 when a real breaking change needs it.
5. ~~**Fork completion (this sync branch)**~~ — **done 2026-07-06** except committing this doc: task/label unblocked via the factory, `lens:check` in CI.
6. ~~**Unified evolution-contract factory**~~ ([Design revision](#design-revision)) — **done 2026-07-06**; upstream contribution still open.
7. ~~**1.10 context-entity coverage**~~ — **done 2026-07-06** via `evolutionContract.context` + client `entityTypeOf` extension.

---

## Scope decision

The lens system currently covers **product entities only** (`task`, `label`, `attachment`, `page`). This section records why, what context-entity coverage costs, and the target contract for Phase 2 — where the current asymmetry would look arbitrary to peers and 3rd-party consumers.

### How the three surfaces differ (code-verified)

| Surface | Write path | Client cache | Lens coverage today |
|---|---|---|---|
| **Product entities** (`task`, `label`, `attachment`, `page`) | stx ops + HLC/AWSet per-field merge via `resolveUpdateOps` | per-query Dexie records, seq/catchup, offline queue | Full — all four artifacts |
| **Context entities** (`organization`, `workspace`, `project`; `user` follows the same pattern) | plain `PUT`, full-body `createInsertSchema(...).partial()` (drizzle-zod) — **no ops, no stx, no HLC** | bundled into the single Dexie meta record (`contextQueries`), 30s staleTime, no seq | **At audit time (2026-07-06): none** — boot migration *iterated* `contextQueries`/mutations but `entityTypeOf` matched only product types, so context rows passed through unmigrated; only backstop was the `clientCacheVersion` wipe + `failed_sync` quarantine. **Now covered via 1.10** (reduced artifact set — see Design revision). |
| **Non-entity surface** (auth/session, stx/ops envelope, SSE notifications, catchup summaries, counter formats) | frozen envelope (D4) | n/a | Deliberately excluded — changes only via `apiVersion` |

Two audit facts change the calculus vs. how this plan originally framed the scope:

1. **Context coverage is much cheaper than product coverage was.** The hard, risky artifact — `normalizeOps` + `stx.fieldTimestamps` key rewriting (the LWW-skew closure that justified most of this design) — is *inapplicable*: context entities have no per-field merge. What remains is (a) a **body-schema widener** (a generalization of `widenBodySchema`, which already operates on a plain ZodObject) applied to the drizzle-zod partial schemas, (b) making `entityTypeOf` / `migrateCachedEntity` / `migrateQueuedMutation` (all currently `ProductEntityType`-typed) accept context types, (c) the same Drizzle dual-emit expand convention on reads. Roughly a third of the product-side machinery, reusing the same lens modules, global ordinal, telemetry, and CI guards.
2. **The context gap is a real Phase 1 hole, not just Phase 2 optics.** Context mutations *are* queued offline (`networkMode: 'offlineFirst'` is global; `shouldDehydrateMutation` persists any paused mutation regardless of entity type). An org rename queued under an old bundle replays in old shape against a new server; today only the interim wipe + quarantine catches it.

### Decision: a three-tier contract, made explicit

- **Tier 1 — product entities: full lens coverage** (as designed). Offline-weeks caches, per-field merge, and queued edits make all four artifacts necessary here.
- **Tier 2 — context entities: same lens modules, reduced derivation** → new item **[1.10](#110-context-entity-lens-coverage-tier-2)**. Context lenses derive body-schema widening + cache/mutation migration + dual-emit, and skip key maps / `normalizeOps` / timestamp rewriting entirely. Until 1.10 lands, a breaking context change uses the `clientCacheVersion` hatch (the gate already enforces it).
- **Tier 3 — non-entity protocol surface: versioned, not tolerant.** Auth, session, the stx/ops envelope, SSE protocol, and counter formats keep changing only via `apiVersion`. This is not an inconsistency to apologize for — it is the standard industry split: *resources* evolve tolerantly per-consumer; the *protocol* version-negotiates globally (Stripe's model: payload down-migration per consumer version, transport/auth versioned as a whole).

**Why this answers the "peers will find it weird" concern:** what a peer or 3rd party consumes is entity resources over a protocol. With Tier 2 in place, **every resource** they can read or write is version-tolerant under uniform rules (one lens ordinal, expand windows, `/versions` discovery), and the protocol advertises `apiVersion`. The weirdness exists only in today's intermediate state — `page` tolerant while `organization` is brittle — which is exactly why 1.10 is a **Phase 2 prerequisite**, not an option. Publishing versioned specs (2.1) before 1.10 would freeze the asymmetry into peer-visible artifacts.

**Sequencing:** 1.10 does not block lens #1 for a product entity; it blocks (a) the first breaking context-entity change and (b) the start of Phase 2.

---

## Design revision

Triggered by two findings. (a) The task/label seam gap is an **active regression**: the old single-argument `createUpdateSchema({…})` calls put the shape object in the new `entityType` parameter, collapsing the derived ops schema to an empty object — the regenerated SDK shows `zUpdateTaskBody.ops` / `zUpdateLabelBody.ops` as `z.record(z.string(), z.unknown())`, typecheck fails, and at runtime the empty schema strips all ops keys so the ≥1-op refine rejects every update. (b) The Tier 2 decision means the widening/normalization layer must serve context entities anyway. Rather than bolting on a parallel context mechanism, restructure the seam layer once so **both entity classes share it**. The lens engine in `shared/src/schema-evolution/` is untouched — this revision is entirely about the Cella-side seams.

### The problem: four patterns for one concept

| | Create | Update |
|---|---|---|
| **Product** | hand-assembled drizzle-zod pick/extend `+ stx`, wrapped in `widenBodySchema(type, schema)`; handler must separately call `normalizeCreateItem(type, item)` | `createUpdateSchema(type, opsShape)` with a **hand-written re-typing** of the fields; handler must separately call `resolveUpdateOps(type, …)` |
| **Context** | drizzle-zod pick/extend; no widening, no normalize | drizzle-zod customize + pick + `.partial()`; no widening, no normalize |

Costs of the divergence, all observed in the 2026-07 audit:

- **Forgettable wiring** — four calls spread across two files per product entity; `task`/`label` prove the failure mode is silent (degraded SDK contract, zero CI signal).
- **Duplicated widening logic** — `createUpdateSchema` inlines its own alias loop while `widenBodySchema` implements the same aliasing separately (plus required-relax). Two implementations of one lens derivation.
- **Validation drift** — create bodies inherit the rich drizzle-zod/refined validators (`validNameSchema`, html max-lengths, …) while ops shapes are re-typed by hand (`z.string().max(…)`), so update can accept values create would reject, and every field's value type is declared twice per entity.
- **No context path** — the Tier 2 gap.

The underlying concept is singular: every wire body is an **entity body** — full (create) or partial (update) — optionally accompanied by `stx`. An `ops` object *is* a partial entity body; a context PUT body is the same thing without stx. Widening (old-name aliases) and normalization (canonical keys + expand mirror writes) are body-level operations; the only sync-specific extra is rewriting `stx.fieldTimestamps` keys — and the presence of `stx` is exactly the discriminator. (`normalizeCreateItem` already proves this: it is a thin wrapper that feeds create fields through `normalizeOps`.)

### The fix: one factory per entity module — as built 2026-07-06

One registration point per entity ([backend/src/core/schema-evolution/evolution-contract.ts](../backend/src/core/schema-evolution/evolution-contract.ts)), two factories under one `evolutionContract` object (clearer TypeScript inference than a single factory with a class flag — each method is its own generic function):

```ts
// Product (sync) entity — task-schema.ts
export const taskContract = evolutionContract.product('task', {
  createItem: taskCreateSchema,          // module-assembled ZodObject (drizzle-zod picks, defaults, refines)
  updateOps: {                           // ops shape: scalar LWW + AWSet delta fields
    name: z.string().max(maxLength.field),
    labels: arrayDeltaSchema,
    // …
  },
});
// taskContract.createItemSchema  — createItem + stx, lens-widened; modules compose .array().min().max()
// taskContract.updateBodySchema  — { ops: partial(updateOps) widened, stx }, ≥1 op required
// taskContract.normalizeCreateItem(item)          — entity-bound runtime seam (create)
// taskContract.resolveUpdateOps(entity, ops, stx) — entity-bound runtime seam (update)

// Context (plain) entity — organization-schema.ts
export const organizationContract = evolutionContract.context('organization', {
  createItem: z.object({ id: validTempIdSchema, name: validNameSchema, slug: validSlugSchema }),
  updateBody: createInsertSchema(organizationsTable, { /* … */ }).pick({ /* … */ }).partial(),
});
// organizationContract.createItemSchema / updateBodySchema — lens-widened
// organizationContract.normalizeBody(body)                 — entity-bound runtime seam
```

- **One widener** — `widenBodySchema(entityType, zodObject)` (the `LensEntityType`-typed widener; formerly the create-only `widenCreateSchema`) applied to every derived schema; `createUpdateSchema`'s duplicate alias loop was deleted — it now widens via `widenBodySchema(z.object(opsShape).partial())`.
- **One runtime normalizer core** — `normalizeBody(entityType, body)` (a thin `normalizeOps` wrapper, like `normalizeCreateItem`) for plain bodies; every create/update operation of all 7 entities calls its contract-bound seam first thing.
- **Deviation from the original sketch (deliberate)**: `createItem` stays a module-assembled ZodObject instead of being derived from a `base`+`createOnly`+`sets` field source. Create schemas carry picks, defaults (`status: .default('unpublished')`), and batch refines that a raw-shape union can't express without reinventing drizzle-zod — and forcing it would have churned the API contract. The update shape is still declared exactly once (in `updateOps`/`updateBody`, adjacent to `createItem` in the same call). Full single-source-of-field-types remains possible later without touching call sites again.
- **Completeness is checked** — `lens:check` rule 4 asserts every `appConfig` product/context entity type calls its contract factory in `backend/src/modules`; runs in CI (lint job).
- **Typed by construction** — factories are generic over the raw shapes (`z.ZodObject<S>` parameters, not a `ZodObject<ZodRawShape>` constraint, which would collapse inference to `Record<string, unknown>` — the exact failure mode the mispositioned argument caused in the SDK).

### What deliberately stays different

Update *semantics* stay divergent by design: product updates merge per-field (HLC/AWSet over `{ ops, stx }`), context updates stay full-body-partial PUT with server-authoritative last-write. Aligning the **schema/tolerance layer** does not require aligning the **merge layer** — moving context entities onto ops+stx was considered and rejected: it would drag them into CDC/seq/catchup scope for no user-visible gain and contradicts the deliberately lightweight context design (SYNC_ENGINE.md). Likewise create vs update keep different *shapes* (full vs partial, `createOnly` fields) — the factory aligns their *source and derivation*, not their contracts.

### Migration order — executed 2026-07-06

1. ~~Introduce the factories + generalized `widenBodySchema`/`normalizeBody`~~ — **done** (`widenCreateSchema` renamed to `widenBodySchema`, no alias; `createUpdateSchema` retained as the sync-update builder used by the product factory).
2. ~~Move all four product entities onto it~~ — **done**; SDK regenerated **byte-identical** to the pre-sync contract (the refactor is contract-neutral; the task/label collapse is gone).
3. ~~Completeness check + CI~~ — **done** (`lens:check` rule 4 + CI lint-job step with full-history checkout).
4. ~~**1.10** context entities~~ — **done**: engine types widened to `LensEntityType`, organization/workspace/project wired (`normalizeBody` in all six create/update operations), client `entityTypeOf` recognizes context types (boot migration now rewrites context rows + mutations). Covered by `evolution-contract.test.ts` (synthetic context lens) and updated frontend cache-migration tests.
5. **Open**: contribute the factory back to upstream cella — it is template-shaped, and upstream currently hand-wires attachment/page with the same forgettable four-call pattern this fork tripped over. Upstream PR should carry evolution-contract.ts, the lens-seam/update-schema refactor, the `LensEntityType` widening, and the `lens:check` rule.

**Full-API tolerance (rejected):** lensing the frozen envelope would mean transforming the sync protocol itself per consumer version — the exact trap Cambria hit patch-lensing Automerge internals (D4, Prior art). There is also no in-repo external SDK consumer today (the generated SDK is consumed only by frontend/backend/cdc workspaces). If a real 3rd-party consumer materializes before Phase 2, they get Tier 1+2 tolerance on entities and `apiVersion` on the envelope — same as our own clients.

---

## Lens playbook

> ❌ **Not yet written.** Earlier revisions claimed the playbook had "moved to the committed docs" at `cella/SCHEMA_EVOLUTION.md` — but this file *is* that path (the plan was authored in `info/`, moved to gitignored `.todos/`, then dropped into the `cella/` slot where the committed playbook was supposed to live; the playbook itself never existed anywhere). AGENTS.md, SYNC_ENGINE.md, and ARCHITECTURE.md all point here for it, so writing it is a prerequisite for lens #1. Required content:
>
> - **Expand PR recipe** — the lens module, the Drizzle expand-migration convention (add + backfill the new column, keep the old), mirror-write window start, `feat!` title / gate interplay.
> - **Verification** — the offline e2e runbook (`pnpm offline` flow: bundle A populates cache + offline edits, swap to bundle B with the lens, reconnect, assert zero data loss and no refetch storm).
> - **Contract PR recipe** — fleet-floor check against `X-Client-Version` telemetry, column drop, and the not-yet-built `contractedLenses` mechanism.
> - **Branch-local rehearsal** — exercising a throwaway lens on a branch without polluting the append-only registry (temporary lens-list entry, never merged; `lens:check` append-only rules apply from first commit on main only).

### Research-informed design adjustments

- **Reprioritize delta kinds: `add` leads, not `rename`.** Empirically, additions are >50% of schema changes in 9 of 10 studied projects ([NoSQL study](https://arxiv.org/pdf/2003.00054)). Practical frequency: add-with-default ≫ drop > rename ≈ retype > enum renames > restructuring.
- **Default-as-function for `add`** — **implemented 2026-07** (`resolveAddDefault` in define.ts): `default` may be a pure `(row) => value` (still passing the purity lint). Covers "new field derived from existing ones" — the gap Cambria flagged as unsolved ("no mechanism to look up missing data").
- **Complement for `drop`/downgrade** (panproto, per Diskin et al. lenses-with-complement): stash removed values in a side-channel instead of destroying them so round-trips are lossless. Cheap for queued mutations; most relevant to Phase 2 peer downgrades.
- **`unknownFieldHandling` policy knob** — **implemented 2026-07** (`ignore | strip | fail`, default `strip`, in `schemaEvolutionPolicy`; per LiveStore's `unknownEventHandling`): `normalizeOps` handles post-lens unmappable fields per policy when callers pass `canonicalKeys`, and always reports them via `unknownFields` (hosts log/otel — covers `warn`).
- **Version the lens-module format itself** — **implemented 2026-07** (`formatVersion` + `LENS_FORMAT_VERSION` in define.ts, stamped/validated by `defineLens`) — Cambria's "lens inception" open problem; modules are append-only and immortal, so day-one was the cheap moment.
- **Future CLI assist**: diff→lens derivation (panproto's model) — a `cella` CLI step diffs Zod/OpenAPI schemas and *proposes* the lens module; developer resolves rename-vs-drop+add ambiguity. Replaces hand-authoring, not the review.
- **Confirmed non-goals**: no restructuring ops (`hoist`/`plunge`, `wrap`/`head`, `in`/`map`) — Cambria's appendix shows scalar↔array has only trade-offs, and Cella's flat SQL-backed rows rarely nest; model rare restructures as `drop` + `add`-with-computed-default. One-to-many splits / cross-entity moves stay outside the lens system as one-off scripts (unsolved by Cambria and DXOS alike).

---

## TL;DR

Breaking schema changes (e.g., rename `task.name` → `task.title`) are shipped as **append-only lens modules**. Each lens declares the change once; everything else is derived from that declaration:

1. **Widened wire schemas** (build time) — during the expand window, ops/create schemas accept both old and new field names; entity rows carry both columns so responses dual-emit both
2. **Ops normalization** (server, runtime touch point 1) — old-shape `ops` + `stx.fieldTimestamps` keys normalized to canonical inside the existing stx resolve path
3. **Client cache migration** (client, runtime touch point 2) — boot-time Dexie pass rewrites cached rows + queued mutations locally, no refetch
4. **Versioned OpenAPI specs + response down-migration** (Phase 2 only) — for fork mesh negotiation

**Phase 1 has exactly two runtime transformation touch points.** Everything else is build-time schema generation, data-level dual-emit during expand windows, or deferred to Phase 2.

doba provides the migration chain executor, bidirectional migrations, graph path-finding (Phase 2), and telemetry hooks. We provide the lens module convention, the Cella seams, and the OpenAPI artifact.

**Two phases:**
- **Phase 1 — Internal version tolerance**: app's own offline clients survive deploys (PWA skew, mid-exam, offline queue replay)
- **Phase 2 — Fork mesh**: independently-deployed Cella forks interoperate via version negotiation

---

## Transformation points

```
┌──────────────────────────────────────────────────────────────────────────────┐
│           Phase 1 — two runtime touch points (▣), rest is build time         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BUILD TIME                                                                  │
│  ┌──────────────────────────┐  derives  ┌─────────────────────────────────┐ │
│  │ shared/schema-evolution/  │ ────────> │ widened ops/create Zod schemas  │ │
│  │ lens modules (frozen,    │           │ key maps (ops + fieldTimestamps)│ │
│  │ append-only)             │           │ cache-row migrations (doba)     │ │
│  │ delta: name → title      │           │ versioned specs (Phase 2)       │ │
│  └──────────────────────────┘           └─────────────────────────────────┘ │
│                                                                              │
│  WRITE PATH (server)                                                         │
│                                                                              │
│   old bundle ──ops:{name}──┐                                                 │
│                            ├──> Zod validation ──> ▣ normalizeOps()          │
│   new bundle ──ops:{title}─┘    (widened schema     key map: name→title      │
│                                  accepts both)      + stx timestamp keys     │
│                                                     + mirror-write twin col  │
│                                            │                                 │
│                                            ▼                                 │
│                                  HLC/AWSet merge ──> DB                      │
│                                  (canonical keys     (canonical + mirrored   │
│                                   only)               old column)            │
│                                                                              │
│  READ PATH (server) — no transform                                           │
│                                                                              │
│   DB row {name,title} ──> handler/enrichment ──> TTL cache ──> response      │
│                           dual-emits both fields during expand window:       │
│                           old bundle reads `name`, new bundle reads `title`  │
│                                                                              │
│  CLIENT BOOT                                                                 │
│                                                                              │
│   Dexie restore ──> buster < current? ──> ▣ boot migration pass              │
│   (per-query rows,                          lens chain over cached rows +    │
│    meta.mutations)                          queued mutation ops/stx keys     │
│                                             (chunked txns, leader-gated)     │
│                                            │                                 │
│                                            ▼                                 │
│                                   hydrate React Query ──> UI                 │
│                                                                              │
│  UNTOUCHED: CDC worker · SSE notifications · catchup summaries · seq/counters│
│  TTL entity cache · activitiesTable (operate on IDs/seqs or canonical shape) │
└──────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────────────────┐
│           Phase 2 — fork mesh adds per-version edge transforms (▣)           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Fork B (schemaVersion 5)                This fork (schemaVersion 9)        │
│                                                                              │
│   ops:{name} ── Accept-Version: 5 ──>  ▣ upgrade via doba path               │
│                                          (v5 → v7 → current)                 │
│                                            │                                 │
│                                            ▼                                 │
│                                          normalizeOps ──> handler ──> DB     │
│                                                                              │
│   reads name <── response ──────────── ▣ downgradeEntity(entity, v5)         │
│                                          post-TTL-cache; lossyBackward       │
│                                          fields omitted                      │
│                                                                              │
│   GET /versions ──> { schemaVersion, lenses, /openapi/{v}.json }             │
│   no path in lens graph ──> 426 Upgrade Required                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Touch point reduction (vs. earlier draft)

| Earlier draft | Now | Why it's safe |
|---|---|---|
| Pre-validation middleware + Hono `bodyCache` overwrite | **Cut** | Widened expand-window schema makes old shapes *valid*; normalization moves after validation into `resolveUpdateOps` — code the sync engine already owns. No Hono internals. |
| Per-request response down-migration (Phase 1) | **Deferred to Phase 2** | Expand-window rows dual-emit both fields — old bundles read old names with zero per-request work; contract is gated on fleet floor + staleness deadline |
| `X-Client-Version` as correctness input | **Telemetry-only in Phase 1** | No Phase 1 transform decision depends on it; it gates contract timing only |
| SSE `?cv=` version param | **Cut** | Notifications are frozen envelope — they carry no entity fields |
| Two doba registries per entity (`entity` + `ops`) | **One registry + derived key map** | Ops transforms for rename/add/drop are pure key renames; a `Record<old, new>` suffices |
| Tolerant reader with doba `identify`/`tryParse` | **Cut** | Migrations are idempotent — re-run the chain on suspicion; evict single records on Zod failure |

---

## Why doba

Verified against doba source (`packages/doba`, v0.1.0):

| Requirement | doba support | Verified |
|---|---|---|
| Bidirectional lenses | `'v0<->v1': { forward, backward }` reversible migrations | `migration.ts`, `resolveMigrations` |
| Declarative single-source transform | pipe builder: `p.rename().map().drop().add()` | helpers docs + playground |
| Lens graph + shortest path (fork mesh) | BFS/Dijkstra, `cost`/`preferred`/`deprecated` edges, `findPath`, `explain()` | `graph.ts`, `registry.ts#L328` |
| Zod compat | Standard Schema v1 (`~standard.validate`); Cella ships Zod 4.4.3 (native SSv1) | `standard-schema.ts` |
| Browser + Node | Zero runtime deps, pure ESM, no Node APIs (`performance.now()` only) | package.json, registry source |
| Hot-path perf | `validate: 'none'` skips all schema validation; `from === to` fast path; graph precomputed at construction | `transformCore`, `transform()` |
| Tolerant reader | `identify` guard map + `tryParse` fallback, `identifyAndTransform()` (not used in Phase 1 — see 1.6) | `registry.ts#L837-L926` |
| Telemetry | `hooks.onTransform/onStep/onWarning`, `ctx.warn`/`ctx.defaulted` → `result.meta.warnings/defaults` | `context.ts` |
| Error handling | Errors as values (`Result<T, DobaIssue[]>`), migrations that throw → `transform_failed` issue | `result.ts`, `transformCore` catch |
| Packaging quality | publint + arethetypeswrong in `prepublishOnly`, `files: [dist]` | package.json |

**Risk management for the dependency:**
- Pin exact version in `pnpm-workspace.yaml` catalog; review diffs on every bump.
- MIT, zero deps, ~10 source files → **vendoring into `shared/` is the documented escape hatch** if the project stalls.
- Write our integration behind a thin facade, `shared/src/schema-evolution/engine.ts`, so doba is swappable: only the facade imports `dobajs`.

**What doba does NOT provide (we build):**
- Lens module convention (frozen, append-only, date-ordered files)
- Key-map derivation for `ops` + `stx.fieldTimestamps` (see D1)
- OpenAPI spec replay artifact
- Cache pointer + Dexie migration pass
- CI guards (append-only lint, oasdiff, config-collision validator)

**Note on Phase 1 footprint:** Phase 1 exercises doba only as a linear chain executor for cache-row migration; its graph/path-finding payoff lands in Phase 2. This keeps the dependency trivially replaceable while Phase 1 hardens in production.

---

## Architecture decisions

### D1: One entity registry per type; ops handled by derived key maps

A product entity has two wire shapes (`entity` full row; `ops` partial update with AWSet deltas), but they do **not** need separate transform machinery. For every delta kind except `retype`, the ops-side transform is a pure key rename — identical to the entity-side key change. So:

- **One doba registry per entity type** (entity shape; nodes `v0`, `v3`, ... `current`) — used by the client cache migration and Phase 2 `downgradeEntity`
- **One derived key map per lens** (`Record<oldKey, newKey>`) applied to `ops` objects, `stx.fieldTimestamps`, and queued mutation variables — a ~10-line helper, no registry needed
- Only `retype` deltas (rare) declare a custom ops converter in the lens

```ts
// shared/src/schema-evolution/engine.ts (facade — only file that imports dobajs)
const entityRegistries: Record<ProductEntityType, Registry<...>>; // doba: cached rows, peer downgrade
const keyMaps: Record<ProductEntityType, Record<string, string>>; // ops + stx timestamp keys
```

### D2: Global schema version = lens count; per-entity nodes derived

- `currentSchemaVersion = lenses.length` (global ordinal, monotonic, baked into both bundles from `shared`).
- Per entity type, version **nodes** exist only where that entity changed: task lenses at global ordinals 3 and 7 → task nodes `v0` (pre-3), `v3`, `v7` (= current). A consumer at global version 5 maps to task node `v3` (latest task node ≤ 5). This keeps chains short and avoids no-op hops.
- Within the app, chains are linear → BFS. Fork mesh (Phase 2) adds branches → Dijkstra with `deprecated`/`cost` edges. Both are doba built-ins; nothing changes in our code.

### D3: Phase 1 needs no version negotiation for correctness

- **Server writes**: the widened expand-window schema makes old-shape ops *valid*; normalization is presence-based (`'name' in ops` → map to `title`) and unambiguous within an expand window. No header consulted.
- **Cache rows**: version comes from the persisted **cache pointer** (as built: the dedicated `schemaVersion` meta field; the RQ `buster` slot stays `''`), never from inspecting rows.
- `X-Client-Version` is still sent from day one, but in Phase 1 it is **telemetry-only** (fleet floor for contract gating). It becomes a correctness input only in Phase 2, where `Accept-Version` drives response down-migration for arbitrarily-old peers.

### D4: Canonical shape inside; dual-emit at the edge during expand

- DB business logic, CDC, activitiesTable, TTL entity cache, SSE notifications: **newest shape only** (plus the mirrored old column during an expand window).
- Responses need **no per-request transform in Phase 1**: during expand, the row contains both columns (Drizzle backfill + mirror writes), so responses dual-emit both field names with zero work. Per-version `downgradeEntity` exists only in Phase 2 for peers, applied *after* TTL cache read (canonical cache, no per-version fragmentation).
- The **frozen envelope** is exempt from lensing and may only change via `apiVersion` bump: `stx`/`ops` wire structure, `StreamNotification`, `CatchupChangeSummary`, counter key formats (`s:{type}`, `e:{type}`), auth/session contract, SSE/WebSocket protocol. Enforced by CI guard (1.8).

### D5: Old schema versions are derived, not snapshotted

We never snapshot full entity Zod schemas per version. The doba registry's older schema nodes are **generated at startup** by reverse-applying each lens's declarative delta to the current canonical schema (`.omit()` / `.extend()` on Zod objects). Same replay logic powers the versioned OpenAPI artifact (2.1). Hot paths use `validate: 'none'`, so these derived schemas matter only for tests, tolerant-reader `tryParse`, and spec generation.

---

## Lens anatomy

```text
shared/src/schema-evolution/
  engine.ts                              # doba facade: builds registries from lenses
  define.ts                              # defineLens factory + types
  index.ts                               # ordered registry (append-only imports)
  2026-07-01-task-name-to-title.ts       # frozen lens module
```

```ts
// shared/src/schema-evolution/2026-07-01-task-name-to-title.ts
// FROZEN once shipped — CI fails on edits. Append-only.
import { defineLens } from './define';

export default defineLens({
  id: '2026-07-01-task-name-to-title',
  entityType: 'task',
  description: 'Rename task.name → task.title',
  phase: 'expand', // 'expand' | 'contract' — drives spec + wire widening

  // Single declarative source. Everything below is DERIVED from it:
  // - doba entity migration (forward + backward via pipe-equivalent)
  // - doba ops migration (forward + backward)
  // - stx.fieldTimestamps key map
  // - OpenAPI spec delta (reverse replay)
  // - reverse-derived Zod schema for the older node
  delta: { rename: { from: 'name', to: 'title' } },

  // Optional escape hatch when delta alone can't express the change
  // (retype, splits/merges). Pure functions; receive doba ctx for
  // ctx.defaulted/ctx.warn telemetry. Rename/add/drop never need this.
  custom?: { entityForward?, entityBackward?, opsConvert? },

  // Security flag: backward direction re-exposes removed data → forbid.
  lossyBackward?: boolean, // if true, Phase 2 downgradeEntity omits instead of restoring
});
```

Supported `delta` kinds (each with deterministic forward/backward/spec/timestamp derivations): `rename`, `add` (with default for backward-compat fill), `drop`, `retype` (requires `custom` converters), `setRename` (rename of an AWSet field).

The derived `fieldTimestamps` key map is applied wherever stx travels: server-side `normalizeOps` (incoming `stx.fieldTimestamps`), cache migration (stored entity `stx`), and queued mutation rewrite. **This closes the LWW-skew gap**: without it, a renamed scalar would lose its HLC history and an older offline edit could win.

---

## Phase 1 — internal

### 1.0 Version telemetry header

Phase 1 correctness does not depend on knowing the client version (D3) — but contract gating does. Ship the cheap part from day one:

- Add `currentSchemaVersion` export to `shared/src/schema-evolution/index.ts`; baked into each bundle at build time.
- **Frontend**: set `X-Client-Version` header in the fetch wrapper in [frontend/src/lib/api-client.ts](../frontend/src/lib/api-client.ts) (`createClientConfig`) — one place, covers the whole generated SDK. No SSE changes (notifications carry no entity fields).
- **Backend**: read the header into an otel counter keyed by version. No `ctx.var`, no middleware logic beyond the counter.
- The version distribution is the fleet floor for "safe to contract" (1.9). Phase 2 upgrades the same header pattern into a correctness input for peers.

### 1.1 Lens package + doba registries

- Add `dobajs` to the `shared` package (pinned exact). `shared` is already consumed by backend, frontend, and cdc — single source of truth, ships atomically with each bundle.
- Implement `define.ts`, `engine.ts` (delta → entity registry migrations + key maps + widened schemas + reverse schema derivation), `index.ts` ordered list.
- `engine.ts` exposes the only API the rest of the codebase uses:

```ts
normalizeOps(entityType, ops, stx): { ops, stx }             // key maps + mirror writes (server seam)
migrateCachedEntity(entityType, entity, fromVersion): entity // doba chain → current (incl. stx keys)
migrateQueuedMutation(entityType, variables, fromVersion): variables // key maps
widenedOpsKeyMap(entityType): Record<string, string>         // expand-window alias map; call sites widen the Zod schemas
downgradeEntity(entityType, entity, toVersion): entity       // Phase 2 only (peers)
currentSchemaVersion: number
versionNodeFor(entityType, globalVersion): string            // D2 mapping
```

- All calls use `validate: 'none'` (zod-openapi / Dexie context validate elsewhere); `from === to` short-circuits in doba make the steady-state cost ~zero.
- Unit tests: round-trip property tests per lens (forward∘backward = identity modulo declared loss), timestamp-map consistency, derived-schema equality vs hand-written expectation.

### 1.2 Widened schemas + ops normalization (backend, single seam)

> **Partially superseded by the [Design revision](#design-revision)**: the two derived pieces below stand, but the per-module call-site pattern (four separate calls) is replaced by the per-entity contract factory.

No middleware, no body re-parsing, no Hono internals. Two derived pieces:

1. **Widened wire schemas (build time)** — while a lens is in its expand window, the generated ops/create Zod schemas accept **both** field names (old optional alias generated from `delta`, not hand-edited in module schemas). Old-shape requests pass OpenAPIHono validation unchanged — including curl/tests that send no version header.
2. **Normalization at the existing stx seam (runtime)** — `resolveUpdateOps` ([backend/src/core/stx/resolve-update.ts](../backend/src/core/stx/resolve-update.ts)) and the create operation helper call `normalizeOps(entityType, ops, stx)` first thing:
   - apply lens key maps to `ops` and `stx.fieldTimestamps` (old → canonical),
   - during expand, **mirror-write** the twin column (new client sends `title` → also writes `name`; old client sends `name` → also writes `title`) so every reader sees fresh data in whichever field its bundle knows,
   - run `custom.opsConvert` for `retype` lenses.

HLC/LWW resolution and AWSet application then operate on canonical keys only. This is the **only server-side runtime touch point**, and it sits in code the sync engine already owns.

### 1.3 Read path: dual-emit instead of response transforms

Phase 1 deliberately has **no response-side transform**:

- During expand, the entity row carries both columns (Drizzle migration adds + backfills the new column; 1.2 mirror writes keep both fresh). Responses, TTL-cache entries, and seq-cursor delta fetches all dual-emit both field names with zero per-request work.
- `droppedFields` after LWW lists canonical names plus the old alias (derived from the same key map) so old bundles can match it.
- **Contract is the enforcement point**: the old column/field is removed only when the `X-Client-Version` fleet floor has passed the expand ordinal for a configured window AND the staleness deadline (1.7) has expired old bundles. CI blocks contract-phase lens PRs otherwise (1.9).
- SSE notifications and catchup summaries are untouched either way (frozen envelope — IDs and seqs only).
- Tradeoff (accepted): expand windows live for days-to-weeks; old+new columns coexist in DB and payloads. Standard parallel-change practice — costs bytes, not transforms.
- Per-version `downgradeEntity` (a true response transform) arrives only in Phase 2, where peers can be arbitrarily many versions behind.

### 1.4 Client cache pointer + boot migration pass

Seam: [frontend/src/query/persister.ts](../frontend/src/query/persister.ts) — product entities are per-query Dexie records; meta record holds `mutations` + `contextQueries`.

> **As built (2026-07)**: the ordinal lives in a dedicated `schemaVersion` meta field, NOT in `buster` — `buster` round-trips through PersistQueryClientProvider and must stay `''`. Pointer-ahead no longer backward-migrates or wipes; it marks the bundle stale (see Multi-tab guard in the status audit). The numbered flow below is the original design, kept for rationale; step 5 is superseded.

- The pointer stores the **global schema ordinal**. Restore flow:
  1. `restoreClient()` reads meta; `pointer = Number(meta.buster || 0)`.
  2. If `pointer === currentSchemaVersion` → restore as today.
  3. If behind → **migration pass before hydration**: for each persisted product-entity query record, map rows through `migrateCachedEntity()` (entity registry, includes stx key rewrite); rewrite `contextQueries` similarly where they contain product entities; rewrite `meta.mutations` variables via `migrateQueuedMutation()`.
  4. Write everything + advanced `buster` in **one Dexie transaction per chunk** (chunk by entity type / N records) with the pointer advanced only in the final chunk's transaction → crash-resume re-runs idempotently (migrations are idempotent by construction: rename of an already-renamed field is a no-op).
  5. If `pointer > currentSchemaVersion` (rollback deploy): run backward migrations if a path exists, else wipe scope (rare; rollbacks within an expand window are no-ops anyway).
- **Session scopes** (`s-<uuid>`): wiped on pointer mismatch instead of migrated (they're allowed to be cold; avoids migrating dozens of orphaned scopes).
- **Leader gating**: the pass runs only in the tab holding the Web Lock leadership ([frontend/src/query/realtime/tab-coordinator.tsx](../frontend/src/query/realtime/tab-coordinator.tsx)); followers wait for a `cache-migrated` broadcast before restoring. See 1.7.
- No network involved: 300–1000 clients migrating costs the server nothing.

### 1.5 Queued mutation replay safety

Seam: `resumePausedMutations()` runs after `waitForActiveCatchup()` in [frontend/src/query/provider.tsx](../frontend/src/query/provider.tsx).

- Mutations were already rewritten on disk by 1.4 in the same transaction as the pointer — they replay in current shape with consistent `stx.fieldTimestamps`.
- In-memory pending mutations during a **live PWA update** (SW swap without full reload): handled by 1.7's forced reload policy — the new bundle restores rewritten mutations from disk.
- Squashing (`squashPendingMutation` / `coalescePendingCreate` in [frontend/src/query/offline/squash-utils.ts](../frontend/src/query/offline/squash-utils.ts)) operates post-migration, so field keys always match — no cross-version squash bugs.

### 1.6 Backstop: idempotent re-run + evict-on-fail (no identify layer)

Because every lens migration is idempotent by construction (rename of an already-renamed field is a no-op), the backstop is trivial:

- If boot detects an interrupted pass (pointer behind, marker present), **re-run the whole chain** over the affected scope — idempotency makes mixed old/new rows safe.
- Any row that still fails a downstream Zod parse → evict that single query record (refetch on demand). Never fleet-wide.
- No doba `identify()`, no `tryParse`, no steady-state Zod parsing of the cache. (Identify-based shape detection is reconsidered only if Phase 2 peer payload auditing needs it.)

### 1.7 Multi-tab + PWA update coordination

The unsolved race in the old plan: an old-bundle tab can persist old-shape rows after a new-bundle tab migrates.

- **Pointer-mismatch broadcast**: on boot, the new bundle broadcasts `schema-version: N` on the existing BroadcastChannel. Tabs running an older bundle (their `currentSchemaVersion < N`):
  - immediately stop persisting (flip `shouldDehydrateQuery`/`shouldDehydrateMutation` to false),
  - show the existing PWA refresh prompt; **force-reload when idle** (reuse the "safe to interrupt" gate from the apiVersion backstop — never mid-task).
- **Leader-gated migration** (1.4) + followers blocked on `cache-migrated` ensures no tab restores mid-rewrite.
- **Persist guard**: persister refuses to write when its bundle's `currentSchemaVersion < buster` on disk (a stale tab can never downgrade the store).
- **Staleness deadline**: bundle older than N days (config) must update before continuing — idle-gated, jittered. PWA update detection wiring (vite-plugin-pwa `registerSW` events) is added as part of this step; today [frontend/src/lib/sw.ts](../frontend/src/lib/sw.ts) has no update handling.

### 1.8 CI guards

1. **Append-only lint**: script fails if any committed file under `schema-evolution/` (except `index.ts`) differs from its first-commit blob (`git log --follow` check). Runs in `pnpm check`.
2. **oasdiff gate**: wire [oasdiff](https://github.com/oasdiff/oasdiff) into the [generate-openapi.ts](../backend/scripts/generate-openapi.ts) / `openapi.manifest.json` flow. Breaking verdict ⇒ PR must add a lens module or bump `apiVersion`; additive ⇒ pass.
3. **Config-collision validator** (build-time test in `shared`): every lens `delta` field name checked against:
   - CDC counter logic field reads (`role`, `rejectedAt` in [cdc/src/utils/update-counts.ts](../cdc/src/utils/update-counts.ts)),
   - `appConfig.entityEmbeddings[].hostColumn`,
   - `propagationTargets` field names,
   - the **frozen envelope** list (D4) — lensing those is a hard error pointing at the apiVersion backstop.
4. **Lens purity lint**: no `await`, no value-dependent logic beyond declared `custom` converters, no dynamic key access from input data.

### 1.9 Telemetry + failure capture

- doba hooks: `onTransform`/`onStep` → otel histograms (`lens.transform.duration`, per lens id); `ctx.defaulted`/`warnings` → counters. Server-side registry created with these hooks; client-side registry without (or dev-only `debug: true`).
- `X-Client-Version` distribution → fleet-floor dashboard: contract phase allowed only when floor > the expand lens's ordinal for a config-defined window.
- **Client `failed_sync` Dexie table**: any migrated mutation that still fails replay with a 4xx is quarantined (never dropped), surfaced in a non-blocking banner with JSON export. (Server-side DLQ table moves to Phase 2 — observability for the fork mesh; internal clients are covered by the client table + version telemetry.)

### 1.10 Context-entity lens coverage (Tier 2) — implemented 2026-07-06

See [Scope decision](#scope-decision) and the as-built API in the [Design revision](#design-revision). Extends lens modules to context entities (`organization`, `workspace`, `project`; `user` deliberately not included yet — same plain-REST path, add when first needed) with a **reduced derivation set**, since context writes are full-body PUTs with no ops/stx:

- **Type surface**: `LensDefinition.entityType` widens from `ProductEntityType`; engine registries, `versionNodeFor`, `migrateCachedEntity`, `migrateQueuedMutation` follow. `lens:check` collision rules apply unchanged.
- **Server side**: context modules register through `evolutionContract.context` (see [Design revision](#design-revision)) — widened create + widened partial-update bodies, `normalizeBody` canonicalizing keys before the handler. No separate context mechanism.
- **Cache migration**: `entityTypeOf` (cache-migration.ts) learns context types, so `migrateScopeToCurrent`'s existing `contextQueries` + mutation walk stops passing context rows/mutations through unmigrated — the iteration seams already exist, they just early-return today.
- **Dual-emit reads**: same Drizzle expand-column convention. Enrichment output (`membership`, `can`, `ancestorSlugs`) is computed, not stored — untouched.
- **Explicitly not needed**: key maps, `normalizeOps`, `fieldTimestamps` rewriting, mirror-write LWW logic — no per-field merge exists on this path.
- **Membership shape caveat**: `membership` rides on context entities via enrichment and has its own table/wire shape; treat its fields as frozen-envelope-adjacent until a concrete need arises (same posture as Yjs-derived fields, Known challenge 5).

### Phase 1 testing strategy

- **Lens unit tests**: per-delta-kind derivation tests + round-trip property tests (already in 1.1).
- **Integration (backend)**: replay a recorded old-version update request against a server with one lens applied → assert upgraded write, correct LWW vs a concurrent new-shape edit, `droppedFields` named in old shape.
- **Integration (frontend, Vitest + fake-indexeddb)**: seed Dexie with old-shape records + queued mutations, boot persister with a lens registry one ahead → assert rewritten rows, advanced pointer, mutations replay in new shape; crash-resume test (kill between chunks, reboot, assert idempotent completion).
- **E2E (offline runbook)**: extend `pnpm offline` flow — build bundle A, populate cache + offline edits, swap to bundle B with a rename lens, reconnect, assert zero data loss and no refetch storm (network log).

---

## Phase 2 — fork mesh

Builds on Phase 1's lens registry; adds negotiation between independently-deployed Cella forks whose entity models diverge.

### 2.1 Versioned OpenAPI spec artifact

- Extend [generate-openapi.ts](../backend/scripts/generate-openapi.ts): after producing the latest spec, replay lens `delta`s newest→oldest to emit each historical spec at `backend/openapi/{ordinal}.json`. Pure JSON-schema rewrites driven by the same `delta` kinds (rename/add/drop/retype) — the lens's fourth artifact.
- Expand-phase specs show both field names; contract-phase specs show only the new one.
- SDK generation ([sdk/openapi-ts.config.ts](../sdk/openapi-ts.config.ts)) stays single-spec (current version) — versioned specs are **for peers**, not for our own SDK.

### 2.2 Version discovery + negotiation

- `GET /versions` (unauthenticated, cacheable): `{ apiVersion, schemaVersion, lenses: [{ id, entityType, phase }], specs: '/openapi/{v}.json' }`.
- Peer requests carry `Accept-Version: <schemaVersion>` (and identify as peers via existing auth — service tokens / org-scoped credentials, reusing `checkPermission()` guards; **no new auth surface**).
- Server behavior: peer requests flow through the same 1.2 seam (key maps cover the live expand window; older peers get an explicit doba chain upgrade before `normalizeOps`; context-entity bodies go through the 1.10 widener/normalizer). Responses gain the **first true response transform**: `downgradeEntity(entity, peerVersion)` applied post-TTL-cache on **all entity routes — product and context (Tier 1+2)** — when `Accept-Version < currentSchemaVersion`. `lossyBackward` lenses omit rather than restore removed fields (security: a field dropped for exposure reasons must not reappear for old peers).
- Unknown/too-old version (no path in the registry graph) → `426 Upgrade Required` with the `/versions` URL — explicit, never silent.

### 2.3 Cross-fork lens graphs (where doba pays off)

- A fork's registry = upstream cella lenses + fork-local lenses. Schema nodes get namespaced ids (`cella:v7`, `raak:v3`) and the graph **branches** — exactly doba's model (schemas are nodes, migrations are edges, Dijkstra with `deprecated`/`cost` edges picks routes).
- Shared-core contract: forks interoperate on the **upstream entity subset** (entities + fields defined in cella core). Fork-divergent fields are dropped with `ctx.defaulted` telemetry when crossing the boundary (lossy edge, costed higher).
- The `cella` sync CLI gains a check: fork-local lenses must not collide with upstream lens ids (date-prefix + fork namespace makes this mechanical).
- Peer-to-peer calls between forks at different upstream baselines route through the shared upstream chain: `raak@v3 → cella:v7 → cella:v5 → forkB@v2`. doba `findPath` + `explain()` give debuggable routing; `pathStrategy: 'direct'` available for pinned contracts.

### 2.4 Server `failed_mutations` DLQ

- Postgres table: `{ id, peerOrClientVersion, entityType, entityId, mutationId, body jsonb, issues jsonb, createdAt }`.
- Written when up-migration or validation fails for a versioned consumer (after lens path attempts). Never auto-replayed; idempotent manual replay via `stx.mutationId`.
- Primary value: observability — alertable signal that some consumer is broken + audit trail for repair.

### 2.5 Contract lifecycle automation

- Telemetry from 1.9 + 2.2 (header distributions) feeds a "safe to contract" check: contract lens PRs are CI-blocked unless the fleet floor (internal clients **and** registered peers) has passed the expand ordinal for the configured window.
- Sunset/Deprecation headers (RFC 8594/9745) emitted on responses served to consumers more than N lenses behind.

---

## Build order

| # | Item | Phase | Depends on |
|---|---|---|---|
| 1 | 1.1 `schema-evolution/` + doba engine facade + tests | 1 | — |
| 2 | 1.2 widened schemas + `normalizeOps` at stx seam | 1 | 1 |
| 3 | 1.0 `X-Client-Version` telemetry header | 1 | 1 |
| 4 | 1.8 CI guards (append-only, config-collision, purity) | 1 | 1 |
| 5 | 1.3 contract-gating policy (fleet floor check) | 1 | 3 |
| 6 | 1.4 cache pointer + boot migration pass | 1 | 1 |
| 7 | 1.7 multi-tab + PWA update coordination | 1 | 6 |
| 8 | 1.5 mutation replay + 1.6 idempotent backstop | 1 | 6 |
| 9 | 1.9 telemetry + client `failed_sync` | 1 | 3, 6 |
| 10 | oasdiff gate (1.8.2) | 1 | 1 |
| 10a | **Unified evolution-contract factory** ([Design revision](#design-revision)) — subsumes the task/label seam fix; upstream candidate | 1 | 1 |
| 10b | **1.10 context-entity coverage (Tier 2)** — gates Phase 2 and the first breaking context change | 1 | 10a |
| 11 | 2.1 versioned specs | 2 | 1, 10b |
| 12 | 2.2 `/versions` + `Accept-Version` + `downgradeEntity` | 2 | 11 |
| 13 | 2.3 cross-fork graphs + CLI checks | 2 | 12 |
| 14 | 2.4 server DLQ | 2 | 12 |
| 15 | 2.5 contract automation | 2 | 9, 12 |

Items 1–5 ship value alone (expand-window tolerance covers the PWA-skew window even before client cache migration exists). The `apiVersion` backstop (session-cookie name bump, idle-gated re-auth, jitter/pre-warm) remains as designed in the superseded research doc and is unchanged by doba.

---

## Known challenges

1. **Expand windows are long-lived state** — old+new columns coexist for days-to-weeks, and overlapping expand windows for the same entity must compose (key-map chains are order-sensitive). Covered by chain property tests; worth a "max concurrent expand lenses per entity" lint.
2. **doba maturity**: v0.1.0, single maintainer. Mitigated by facade + pin + vendoring path, but worth a periodic health check; if we hit a bug, contributing upstream is cheaper than forking. Phase 1 exercises it only as a chain executor, so the blast radius is small.
3. **Derivation in `engine.ts`** (delta → schema widening, key maps, doba migrations, spec deltas) is our code, not doba's — still the highest-correctness-risk module and gets the densest property tests, though materially smaller than the earlier two-registry design.
4. **`retype` deltas** (e.g., `string → number`) need `custom` converters and may be genuinely lossy backward; policy decision per lens (`lossyBackward` + telemetry) rather than a general solution.
5. **Yjs-edited description fields** are outside the lens system (CRDT binary, separate worker); renaming a description-derived field touches the Yjs derived-fields PATCH contract — treat as frozen-envelope-adjacent until needed.
6. **Expand-phase mirror writes** produce dual deltas in CDC `changedFields` and slightly larger payloads during the window — accepted noise, documented.

---

## Prior art

The lens approach here is not novel — it composes well-established ideas. Useful background for anyone extending the system:

### The lens model (closest prior art)
- **Project Cambria — "Translate your data with lenses"** (Ink & Switch). Bidirectional lenses for evolving document schemas in local-first apps, with forward/backward transforms and graph-based version resolution. `doba` is effectively a typed, modern take on this model. <https://www.inkandswitch.com/cambria/> · code: <https://github.com/inkandswitch/cambria-project> · paper (PaPoC '21): <https://dl.acm.org/doi/10.1145/3447865.3457963>
  - Op vocabulary: `rename`, `add`, `remove`, `hoist`/`plunge` (nesting), `wrap`/`head` (scalar↔array), `in`/`map` (nested), `convert` (arbitrary, breaks round-trip guarantees — our `retype` is the same trade).
  - Hard-won lessons we follow: lens at the wire/patch boundary, never inside CRDT internals (patch-lensing Automerge's op format is what killed [cambria-automerge](https://github.com/inkandswitch/cambria-automerge)); tag data with writer schema, translate at read/ingest; defaults mandatory on add/drop. Open problems they left: computed defaults, scalar↔array (six strategies, none correct), one-to-many splits, lens-format versioning ("lens inception").
- **panproto** — the notable 2024–2026 advance: Rust engine (TS bindings) that diffs schema versions and **auto-generates bidirectional lenses**, with machine-checked lens laws, lenses-with-**complement** (lossless drop/restore round-trips), complement-cost pathfinding, and per-edit translation pipelines. Very active (v0.56.x, 2026). Too general to depend on; steal the complement idea and diff→lens derivation. <https://github.com/panproto/panproto> · <https://panproto.dev/> · <https://docs.rs/panproto-lens/latest/panproto_lens/>
- **Local-first software** (Ink & Switch) — motivates offline-tolerant schema migration and sync. <https://www.inkandswitch.com/local-first/>
- **`doba` / `dobajs`** — the transform/registry engine this plan builds on. Note its pipe ops are `rename`/`map`/`drop`/`add` only — our `retype` and `setRename` are extensions in the facade. <https://github.com/karol-broda/doba>

### How local-first sync engines handle this today (2025–2026 survey)
- **Automerge** — no built-in migration support; cookbook says hand-write versioned upgrade functions; Cambria's ideas "not yet implemented". The gap this plan fills is still open in the flagship CRDT. <https://automerge.org/docs/cookbook/modeling-data/>
- **Jazz** — `withMigration` runs on load, per-value, unidirectional; docs admit no guard against mixed-version concurrency. Validates our bidirectional ambition. <https://jazz.tools/docs/react-native/schemas/accounts-and-migrations>
- **DXOS ECHO** — stop-the-world **Epochs** + `MigrationBuilder`; explicitly names Cambria-style lenses as the missing fix for stale-peer writes. <https://dxos.org/blog/decentralized-schema-changes-and-data-migrations/>
- **Zero (Rocicorp)** — no transforms: schema-hash handshake, incompatible clients rejected, manual expand/contract discipline. Our plan is essentially Zero's discipline automated by lenses; their client rejection is our Phase 2 `426` backstop. <https://zero.rocicorp.dev/docs/zero-schema>
- **LiveStore** — event-sourced; versioned event names + an explicit `unknownEventHandling: warn/ignore/fail/callback` policy knob — copied into our `normalizeOps` design (status audit). <https://docs.livestore.dev/patterns/app-evolution/>
- **Electric SQL** — punts (plain Postgres migrations). <https://electric-sql.com/docs/usage/data-modelling/migrations>

### Bidirectional transformations (the theory under "lenses")
- **Boomerang / lenses** — Foster, Greenwald, Moore, Pierce & Schmitt, *"Combinators for Bidirectional Tree Transformations: A Linguistic Approach to the View-Update Problem."* Origin of the well-behaved `get`/`put` lens laws our `forward`/`backward` pairs approximate.
- **Edit lenses / symmetric lenses** — Hofmann, Pierce & Wagner (POPL '11/'12): translating *changes* (not states) with complements — the formal basis for patch-level lensing of `ops`.
- **Lenses with complement** — Diskin et al. 2011; panproto's foundation and the theory behind the complement adjustment in the status audit.
- **BiDEL / InVerDa** — co-existing bidirectionally-linked schema versions in SQL at scale; corroborates the expand-window dual-emit approach. <https://arxiv.org/pdf/1608.05564>
- **Empirical op frequency** — additions dominate schema evolution (>50% of changes in 9 of 10 studied projects): <https://arxiv.org/pdf/2003.00054> · survey: <https://www.worldscientific.com/doi/full/10.1142/S2972370124300012>

### Expand/contract rollout (our `phase: 'expand' | 'contract'`)
- **Martin Fowler — ParallelChange (expand–contract).** <https://martinfowler.com/bliki/ParallelChange.html>
- **Refactoring Databases** (Ambler & Sadalage) — catalog of safe, staged schema migrations the `delta` kinds mirror.
- **Evolutionary Database Design.** <https://martinfowler.com/articles/evodb.html>

### Adjacent / corroborating
- **CRDT data migration** — Automerge docs and the Ink & Switch CRDT work; rationale for our lens also rewriting `stx.fieldTimestamps` (HLC) keys, not just field names.
- **Per-consumer API versioning** — Stripe's API-upgrade write-ups describe response down-migration keyed on consumer version, the shape of our Phase 2 `downgradeEntity` + `Accept-Version`.

