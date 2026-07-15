# Comment-density cleanup — discussion & decisions

Companion doc for the `chore/comment-density` branch. It records the **non-trivial judgment calls**
(not the mechanical banner removals) and **flags any new README that overlaps existing docs**, so a
reviewer can spot-check the risky bits without reading the whole diff.

## Scope & method

- **Goal:** make oversized comment blocks denser *without losing non-obvious information*, and remove
  pure file-narration / decorative banners. Bias was strongly toward **KEEP** — this codebase
  documents deliberately, and most long comments are load-bearing ("why", invariants, fork semantics).
- **Base:** branched off `main` (`cd9968813 refactor: permissions`), so this sits *on top of* the
  concurrent permissions refactor — no overlap conflicts expected at merge.
- **Isolation:** all work done in a `git worktree` (`.claude/worktrees/comment-density`); the main
  working tree was never touched.
- **Rubric (per block > 3 text lines, and every decorative banner):**
  - **KEEP** — states a fact a competent dev can't infer from the code (security invariants, "why",
    cross-file coupling, fork/config semantics, footguns, worked `@example`s). Untouched.
  - **DENSIFY** — valuable but padded; cut signature-restating `@param`/`@returns` and ceremony,
    preserve every non-obvious fact.
  - **DELETE** — file-narration / decorative banners. Relocate any crucial fact before deleting.
- **All changes are comment-only** — no code, types, imports, or code-line formatting were changed.
- **Detector caveats surfaced during the run:** the line-count detector (a) over-counts blocks whose
  length is a valuable `@example` — those were kept; (b) misses short single-title banners — a
  companion grep for `/*****` and `// ====` boxes covered those.

## ⚠️ README overlap flags (requested)

- **`shared/config/README.md` — NOT created (would duplicate `cella/PERMISSIONS.md`).**
  The pilot moved the access-policy/hierarchy file-level docs into a new `shared/config/README.md`.
  On review, `cella/PERMISSIONS.md` §Configuration already documents the same material (hierarchy
  builder, policy matrix, elevation-vs-self rows, product home rows, public-read, `elevatedRoles`) —
  and is currently *more* complete (covers `parentRow`/`publicParent`). Rather than create a sizable
  duplicate, I deleted the README and pointed the source comments in `permissions-config.ts` and
  `hierarchy-config.ts` at `cella/PERMISSIONS.md`. **No new README was added for shared/config.**
- _(Other agents' README flags are appended per-area below as they report.)_

## Non-trivial decisions by area

### shared/ (self)
- **Config section banners → one-line comments.** `config.default.ts` (15) and `config.template.ts`
  (16) used `/*****/` boxes purely as navigational dividers in a long config literal. Collapsed each
  title-only box to a `// Title` comment (kept navigation, dropped 2 lines each). Content-bearing
  banners (e.g. Versioning) were densified to prose, not collapsed. **`config.template.ts` is the
  fork-facing template** — its change is cosmetic (comments only) and mirrors `config.default.ts`.
- **KEPT the engine's "why" comments** untouched: `check-permission.ts` `Actor` discriminated-union
  rationale, `public-read.ts`/`row-conditions.ts` closed-set + parity invariants,
  `access-policies.ts` fail-loud reasoning, `SubjectForPermission` docs. These are safety-critical.
- **DENSIFIED** signature-restating JSDoc on `build-subject.ts`, `action-helpers.ts`,
  `check-permission.ts`, `compute-can.ts`, `permissions/types.ts` (dropped `@param` boilerplate, kept
  the rationale). De-bannered `config-builder/types.ts`, `shared/types.ts`, `tracing/*`.

### bench/ · sdk/ · mcp/ · cella/migrations · root config (agent)
- Almost entirely KEEP — deliberate fork/migration semantics and safety invariants. 1 densification
  (`sdk/src/plugins/tsdoc/plugin.ts` — dropped a `@param` that restated the typed param).
- KEPT `@param`/`@returns` blocks in `tsdoc/plugin.ts` that end with an in-JSDoc `biome-ignore`
  directive (didn't disturb directive placement). KEPT the migration codemod file-top explainers
  (`publicread-codemod.ts`, `context-to-channel.ts`, `icon-codemod.ts`) — they encode lossy-rewrite
  warnings / footgun allow-lists that must stay at point-of-edit. No READMEs touched.

### frontend/src/modules/common (agent)
- 15 multi-line `// ====` decorative boxes in long story/devtools files → one-line `// Title`.
  2 densifications (`use-draft-form.tsx`, `sync-devtools.tsx`). No READMEs touched.
- **KEPT ~45 single-line `// ─── Title ───` box-drawing dividers** in `resizable-panels.tsx` and
  others — they're a consistent navigation house-style and several cross-reference invariant IDs
  (G3/G9/A2/O1/O2) documented in the existing `resizable-panels.md`. Not pure decoration.

### frontend/src/modules (excl. common) (agent)
- 14 banners collapsed, 16 densified. **Cleaned up stale/inaccurate comments** a reviewer should
  glance at: `marketing-config.tsx` "suggested categories" list contradicted the `FeatureCategory`
  type (listed `sync`, omitted `ux`) → dropped; `use-menu.ts` had a stale `@param opts` that isn't a
  param; `passkey-credentials.ts` kept only the non-obvious `@param email` (discoverable vs not).
- KEPT `attachment/dexie/attachments-db.ts` enum glossaries — look padded but encode Transloadit
  step mapping / `source='upload'` restrictions (exported-symbol tooltips). No READMEs.

### frontend/src/query + hooks/utils/lib/routes/stories + vite (agent)
- 8 banners collapsed, 14 densified. **Stale comment fixed:** `use-lazy-component.tsx` documented
  params it no longer has → replaced with an accurate one-liner. `locales-hmr.ts` file-top overview
  duplicated the exported `localesHMR` JSDoc → trimmed, kept its distinct `@example` + a link.
- KEPT `invalidation-helpers.ts` / `use-breakpoints.tsx` blocks whose `@param`s look like padding but
  carry `@see` refs + real `@example`s (detector over-counts these). No READMEs.

### backend/src/modules (agent)
- 3 banners, **30 densified**. **Corrected several factually-wrong comments** (reviewer should
  confirm — these are the main accuracy risk in the PR; I verified the first one against the code):
  - `auth/general/helpers/user.ts` — comment claimed `handleCreateUser` "sends verification emails /
    sets a session"; it does neither → rewritten to actual behavior. **(verified accurate)**
  - `auth/general/helpers/mfa.ts` — "optionally deleted" token, but the call passes `invokeToken:false`
    → dropped the inaccurate clause.
  - `entities/entities-queries.ts` — original had a garbled duplicated sentence → rewrote preserving
    both facts (CAP+1 overflow, membership exclusion via `s:membership` seq).
  - `auth/oauth/helpers/callback.ts` — dropped `@param` boilerplate but kept the SameSite=Strict /
    cross-site CSRF "why" verbatim.
- Deleted redundant `=== Route handlers ===` banners (redundant with filename). No READMEs.

### backend/src/{middlewares,permissions,core,schemas,db} (agent)
- 20 banners, 17 densified, 1 deleted. **KEPT the security core fully** — `permissions/collection-scope.ts`
  and `permissions/row-predicates.ts` (RLS scope resolution + check/SQL parity contract) untouched.
- Converted `row-predicates.test.ts` `/*****/` star-boxes to plain block comments **keeping every
  word** (FORK WATCH / deep-chain / `elevatedRoles` invariants). **Corrected stale `@param db` and a
  "can object"** in `get-channel-entity.ts` / `get-product-entity.ts` that the return type lacks.
  Deleted a banner labeling an empty section in `common-schemas.ts`. No READMEs.

### backend/{utils,lib,mocks,tests,scripts,emails} + backend/src/*.ts (agent)
- 11 banners, 27 densified. KEPT `hash-pii.ts` (every line a security invariant). Deliberately
  **kept a Hyperons attribution `{@link}`** in `emails/renderer/jsx-to-string.ts` — MIT licensing
  provenance, not padding. Deduped a 3-context prefix list restated 5× in `mocks/mock-nanoid.ts`.
  No READMEs.

### infra/{resources,config,compose,tests,index} (agent)
- **43 banners collapsed**, all content preserved. The DNS-before-cert ordering and LB drain-policy
  footguns lived *inside* dash-banners → kept every content line, removed only the rules. KEPT
  `runtime-secrets.config.ts` / `managed-keys.config.ts` file-top blocks inline (point-of-edit
  fork/config contracts, not decoration). No READMEs.

### infra/{tasks,lib,cli} (agent)
- 17 banners, 1 densified. KEPT the `setup-vm-key.ts` "NO write access / cannot escalate" security
  invariant verbatim; collapsed decorative section boxes to nav titles. No READMEs.

### cdc/src + yjs/src (agent)
- 14 banners, 3 densified. **Removed a numbered pipeline-stage file-map** in `pipeline/worker.ts`
  that duplicated `cdc/README.md`'s "Pipeline stages" section → replaced with a pointer to the README
  (good overlap hygiene — no new README). KEPT WAL/seq/circuit-breaker state tables. No new READMEs.

### bench / sdk / mcp / cella/migrations / root (agent)
- Almost entirely KEEP. 1 densification (`sdk/.../tsdoc/plugin.ts`). KEPT `@param` JSDoc that ends
  with an in-block `biome-ignore` directive (didn't disturb it), and the migration codemod file-top
  lossy-rewrite warnings. No READMEs.

## Reviewer's attention list (the non-mechanical bits)

Most of the diff is mechanical (decorative banners → one-line nav comments) and safe. The parts worth
a human eye are the **comment-accuracy rewrites** — where an agent judged a comment factually wrong and
rewrote it to match the code. If the agent misread, the new comment is wrong (the code is provably
unchanged either way). They are:

- `backend/src/modules/auth/general/helpers/user.ts` — `handleCreateUser` behavior *(I verified this one)*
- `backend/src/modules/auth/general/helpers/mfa.ts` — token-deletion clause
- `backend/src/modules/entities/entities-queries.ts` — CAP+1 / membership-exclusion rewrite
- `backend/src/permissions/get-channel-entity.ts` / `get-product-entity.ts` — dropped stale `@param db`
- `frontend/src/modules/navigation/menu-sheet/helpers/use-menu.ts` — dropped stale `@param opts`
- `frontend/src/hooks/use-lazy-component.tsx` — replaced stale param docs

Also cosmetic-but-fork-facing: `shared/config/config.template.ts` section banners were collapsed to
one-line comments (the fork template — comments only, mirrors `config.default.ts`).

## Verification

- **Provably comment-only.** For all 141 changed `.ts/.tsx` files, the TypeScript emit with
  `removeComments:true` is byte-identical between `HEAD` and the branch → **zero code/type/import
  changes**. (A line-level scan of the diff also found no non-comment changed line.)
- **Biome-clean.** `biome check` reports no fixes needed across the repo, including every changed file.
- **No tests run** (comment-only change; nothing to exercise). No new READMEs created.

## Stats

- **141 files changed, +366 / −1487 lines (net −1121 comment lines).**
- ~190 decorative banners collapsed or removed; ~115 JSDoc/comment blocks densified; the large majority
  of long comments (security "why", invariants, fork semantics, worked `@example`s) were **kept**.
- New READMEs: **0** (the pilot's `shared/config/README.md` was intentionally dropped — see flag above).
