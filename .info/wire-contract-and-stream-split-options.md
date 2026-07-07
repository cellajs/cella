# Wire contract & app-stream split — options and plan

Two follow-ups from the [CDC assessment](./cdc-assessment.md), researched with the actual code + an empirical type probe:

- **Part A** — a mechanical assignability assertion tying `CdcOutboundMessage` (what CDC sends) to `CdcMessage` (what the backend validates). *Compile-time only — no runtime, no Playwright.*
- **Part B** — the backend-dispatch + frontend `kind`-switch rewrite that turns the implicit entity-vs-membership branching into an explicit discriminated split. *Runtime behaviour — this is where `pnpm dev` + Playwright earn their keep.*

Both are optional quality moves; neither is required for correctness today.

---

## Part A — Mechanical assignability assertion

### What I actually found (empirical, not guessed)

I added a throwaway probe asserting both directions and ran `tsgo`. The mismatches are **narrow and well-understood — not the rabbit hole I feared**:

**Direction 1 — does CDC's output satisfy the backend schema?** (`CdcOutboundMessage` ⊑ `CdcMessage`)
```
activity.tenantId: 'string | null | undefined' is not assignable to 'string | null'
```
Root cause: CDC types the activity as `InsertActivityModel` (`activitiesTable.$inferInsert`), where every *nullable* column becomes **optional** (`T | null | undefined`). The backend schema is `createSelectSchema(activitiesTable)` (`activitySchema`), where the same columns are **required-nullable** (`T | null`). The compiler stops at the first field (`tenantId`), but the same gap applies to every nullable-not-defaulted column: `userId, entityType, resourceType, subjectId, organizationId` (+ any context columns), `changedFields, stx`, and `createdAt`. **~9 fields, one identical cause.** Crucially, `createActivity` *does* set all of these at runtime — only the static `InsertActivityModel` type is loose.

**Direction 2 — does the backend's validated type satisfy CDC's?** (`CdcMessage` ⊑ `CdcOutboundMessage`)
```
rowData: Property 'id' is missing in 'Record<string, unknown>' but required in 'CdcRowData'
```
The schema's `rowData` is `z.record(z.string(), z.unknown())`; CDC's `CdcRowData` requires `id: string`.

Only **Direction 1 matters** — it's the real invariant ("what CDC emits, the backend accepts"). Direction 2 is incidental.

### Options

**A1 — one-directional `satisfies` assertion, close the optionality gap (recommended)**
Type the outbound activity on the *select* shape for the always-set fields, so it lines up with the schema. Two sub-approaches:
- Base `CdcOutboundMessage['activity']` on `ActivityModel` (`$inferSelect`) instead of `InsertActivityModel` — `ActivityModel` already has `tenantId: string | null` etc. `createActivity` sets every field, so its output satisfies the tighter type; a couple of spots may need a non-null assertion or explicit default.
- Or keep `InsertActivityModel` but wrap: `Required<Pick<InsertActivityModel, AlwaysSetKeys>> & InsertActivityModel`.

Then add a compile-time guard in CDC (a test-d style file, or an inline `satisfies`) so drift fails the build:
```ts
// cdc/src/tests/wire-contract.test-d.ts (typecheck-only)
import type { CdcMessage } from '#/lib/cdc-websocket';
import type { CdcOutboundMessage } from '../services/activity-service';
// Fails to compile if CDC's payload stops satisfying the backend's validated shape.
const _conforms = (m: CdcOutboundMessage): CdcMessage => m;
```
Effort: **S** (~1–2 files). Risk: compile-time only, zero runtime. This is the genuine "can't drift" protection at low cost.

**A2 — derive the CDC type *from* the backend schema**
`import type { CdcMessage } from '#/lib/cdc-websocket'` and type `buildActivityPayload`'s return as `CdcMessage` directly (drop the hand-written `CdcOutboundMessage`). Strongest single-source-of-truth, but forces `createActivity`'s output to satisfy the select shape everywhere it's built — same optionality work as A1, just with less slack and more coupling to the backend module. Effort: **S–M**.

**A3 — one shared schema in `shared`/`sdk` (long-term ideal)**
Define the CDC↔backend payload as a single Zod schema in a shared package; CDC takes the `z.infer` type, the backend imports the schema for validation. Removes the two-definitions problem entirely (today the shape is declared in CDC as a TS interface *and* in the backend as Zod). Effort: **M** (new shared module, move the schema, reconcile the `activity` sub-schema import graph).

### Recommendation (Part A)
Do **A1 now** — it's cheap, compile-time only, and delivers real drift protection (a renamed/removed field breaks the CDC build). Revisit **A3** if/when the payload grows or a third consumer appears. A2 is a reasonable middle but buys little over A1 while coupling CDC harder to a backend internal module.

---

## Part B — App-stream entity/membership split

### The two wire boundaries (this is the key framing)

```
CDC ──internal WS──▶ backend ──SSE (SDK)──▶ frontend
     boundary ①                boundary ②
   CdcOutboundMessage         StreamNotification
   / cdcMessageSchema         (generated into sdk)
```

- **Boundary ①** is co-located (CDC + backend deploy together, same pod). A shape change here is safe to ship atomically.
- **Boundary ②** is the SSE payload, generated into the shared **SDK** and consumed by a separately-deployed frontend. A shape change here means regenerating the SDK and coordinating a frontend/backend release.

The "app stream does two things" discomfort lives at **boundary ② and the frontend**. That's what to fix. Boundary ① is already typed (from the last pass).

### Where the branching lives today (6 sites)
| Layer | File | Branch |
|---|---|---|
| event union | `backend/.../stream/types.ts:52` | `AppStreamProductEvent \| EntityScopedEvent<…resourceType:'membership'>` |
| listeners | `backend/.../entities-listeners.ts:14 / :28` | two registration loops (product vs membership) |
| dispatch filter | `backend/.../helpers/dispatch-to-stream.ts:34` | `if (event.resourceType === 'membership')` → user-targeting vs permission check |
| notification build | `backend/.../stream/build-message.ts:17,20,59` | `isProduct` nulls `seq/stx/cacheToken` for membership |
| wire schema | `backend/src/schemas/stream-schemas.ts:28` | one object, `entityType` XOR `resourceType`, both nullable |
| frontend handler | `frontend/.../app-stream-handler.ts:50` | `if (resourceType === 'membership') { …; return }` early-return to a separate mechanism (query invalidation vs seq-range fetch) |

The distinction is real: membership → `contextType`-driven **query invalidation**; product entity → `seq`/`cacheToken` **range fetch**. Two mechanisms sharing one payload and one channel, told apart by sniffing which nullable field is set.

### Options

**B1 — type-level discriminated union, NO wire change (recommended first)**
Keep the `StreamNotification` JSON byte-identical. Add a *derived* discriminated type + a type guard (in `sdk`/`shared`), and refactor the branch sites to switch on it exhaustively:
```ts
// derived from the existing StreamNotification — no new wire field
export type EntityNotification     = StreamNotification & { entityType: ProductEntityType; resourceType: null };
export type MembershipNotification = StreamNotification & { resourceType: 'membership' | 'inactive_membership'; entityType: null };
export type AppNotification = EntityNotification | MembershipNotification;

export const isMembership = (n: StreamNotification): n is MembershipNotification =>
  n.resourceType === 'membership' || n.resourceType === 'inactive_membership';
```
Frontend `handleAppStreamNotification` becomes an exhaustive `switch`/guard instead of `if (resourceType === 'membership') return`; backend `build-message`/`dispatch` likewise. The compiler now *proves* membership branches never touch `seq/cacheToken` and entity branches always have them.
- **Pros:** zero protocol change → SDK stays compatible, no coordinated deploy, no old-client handling. Delivers the mental-model + type-safety win. Fully unit-and-type-checkable.
- **Cons:** the discriminant is still "which nullable field is set" under the hood (a guard, not a first-class wire field). External SDK consumers don't get an explicit `kind`.
- Effort: **M** (frontend handler refactor + backend build/dispatch + shared guard). Behaviour-preserving if done carefully → **Playwright-verifiable** (see below).

**B2 — explicit `kind` discriminant on the wire**
Add `kind: 'entity' | 'membership'` (non-nullable) to `streamNotificationSchema`; CDC/backend populate it; frontend switches on `n.kind`. This is the "proper" discriminated union.
- **Pros:** first-class discriminant; cleanest for external SDK consumers; impossible to mis-sniff.
- **Cons:** changes boundary ② → regenerate SDK, release frontend+backend together, and tolerate a rollout window where new backend talks to old frontend (add `kind` as optional first, make it required in a later release). More ceremony.
- Effort: **M–L** (schema + SDK regen + both ends + staged rollout).

**B3 — separate physical streams (documented, not recommended)**
A dedicated membership SSE channel with its own dispatcher + frontend `StreamManager`. Justified only if memberships ever need a different delivery guarantee/retention/topology. They don't today; memberships are low-volume and multiplex fine on the one org channel. Effort: **L**, ongoing surface.

**B4 — hybrid**
Ship **B1** now (type-level, safe). If a boundary-② schema bump happens later for another reason, fold in **B2**'s `kind` field opportunistically. Best cost/value curve.

### Recommendation (Part B)
**B1.** It captures ~90% of the value — an exhaustive, compiler-enforced, legible split — at near-zero protocol risk, and it's the version I can validate end-to-end with Playwright without a coordinated deploy. Escalate to **B2** only if we want the discriminant visible to external SDK consumers.

---

## Testing plan (`pnpm dev` + Playwright)

Part A needs none (compile-time). Part B is behaviour-preserving, so the test strategy is **golden-path regression**: capture current realtime behaviour as a baseline, refactor, then prove identical behaviour.

**Harness:** `pnpm dev` (postgres via `pnpm docker`, seeded via `pnpm seed`, backend + CDC + frontend). Two browser contexts authenticated as two users in the same org.

**Flows to assert (baseline first, then after each option):**
1. **Product entity create/update/delete** — user A mutates an attachment; assert user B's list + detail caches update in realtime (no manual refresh). Confirms the `seq`/range-fetch path.
2. **Membership** — invite/add a user, change a role, remove a member; assert the member list + menu invalidate for the affected user. Confirms the `contextType` invalidation path (the branch we're untangling).
3. **Echo prevention** — user A mutates; assert A does *not* double-fetch its own change (stx `sourceId` short-circuit).
4. **Batch** — bulk-create entities; assert one range fetch + correct unseen-count deltas.
5. **Catchup** — disconnect B, mutate in A, reconnect B; assert B reconciles (membership via activity scan, entities via seq).

**Sequencing I'd propose:**
1. You pick a Part A option (A1 recommended) and a Part B option (B1 recommended).
2. I implement A1 (compile-time; verify with `tsgo`).
3. I boot `pnpm dev`, script flows 1–5 in Playwright, and record the **baseline** on `main`.
4. I implement B1, re-run the same Playwright flows, and diff behaviour. Green = behaviour-preserved.

I can drive all of this myself — I just want the option choices first so I'm not building a harness against a design we discard.

---

## TL;DR
- **Part A:** the assertion is easy — the only gap is `InsertActivityModel` (insert-optional) vs `createSelectSchema` (required-nullable) on ~9 activity fields, plus `rowData.id`. Do **A1** (one-directional `satisfies` on a select-shaped activity type). **S**, compile-time.
- **Part B:** do **B1** (type-level discriminated union + guard, no wire change). Same protocol, exhaustive compiler-checked split, Playwright-verifiable. **M**. Escalate to **B2** (`kind` on the wire) only for external SDK consumers.
- Tell me the two picks and I'll implement A1, capture a Playwright baseline, then do B1 and prove behaviour is unchanged.
