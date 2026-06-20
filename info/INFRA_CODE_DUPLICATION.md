# Infra code duplication analysis

The `infra/` package has no `utils/` (or `lib/utils`) home for small cross-cutting helpers, so a number of
tiny utilities have been re-implemented inline across `lib/`, `tasks/`, `cli/`, `agent/`, `compose/` and
`resources/`. This document catalogs the repeated code and notes where existing code in `shared/` (especially
`shared/src/utils`, `shared/src/cli-utils` and `shared/console`) can replace it.

It is intended as a refactor backlog, not a prescription — each item lists the concrete occurrences so the
change can be made surgically.

## Summary

| # | Pattern | Occurrences | Suggested home |
|---|---------|-------------|----------------|
| 1 | Flag / arg parsing (`flag`, `getFlag`) | 2 | Consolidate in `infra/tasks/args.ts` (already exists) |
| 2 | `sleep` / `delay` promise timeout | 5+ | Promote to a single shared helper |
| 3 | "Run as main" entry-point guard | ~17 | New `infra/lib/is-main.ts` |
| 4 | Divider line `'─'.repeat(60)` | 3 (+1 already shared) | Use existing `DIVIDER` from `shared/cli-utils/display` |
| 5 | Ad-hoc check/cross marks (`pc.green('✓')`, `✗`) | several | Use `checkMark` / `crossMark` from `shared/console` |
| 6 | `body === '' ? {} : JSON.parse(body)` | 3 | New `parseJsonBody` helper |
| 7 | Retry-with-attempt-counter loops | 5 | New `retry`/`pollUntil` helper |
| 8 | Scaleway credential fallback chains | 4+ | Consolidate around `bootstrap-scw-env.ts` |
| 9 | `infraDir` path resolution | several | Use existing `infra/lib/paths.ts` |
| 10 | `isRecord` type guard | 2+ | New `infra/lib/guards.ts` (or shared) |
| 11 | `Usage: ...` error strings | 5 | Minor; co-locate with arg parsing |

## Repeated within infra (no shared equivalent yet)

### 1. Flag / argument parsing

Two near-identical flag parsers with different names:

- [infra/tasks/args.ts](infra/tasks/args.ts#L4) — exported `getFlag(argv, flag)` (plus `getNumFlag`, `sleep`).
- [infra/agent/src/main.ts](infra/agent/src/main.ts#L11) — a private `flag(args, name)` with identical logic.

The `agent` copy could import from `infra/tasks/args.ts`, or the helper could move to a neutral
`infra/lib/args.ts` that both `tasks/` and `agent/` import.

### 2. Sleep / delay

The same `new Promise((resolve) => setTimeout(resolve, ms))` is re-declared under three different names and
inlined elsewhere:

- [infra/tasks/args.ts](infra/tasks/args.ts#L16) — `export const sleep`.
- [infra/agent/src/boot.ts](infra/agent/src/boot.ts#L30) — private `delay()`.
- [infra/tasks/smoke.ts](infra/tasks/smoke.ts#L172) — `realSleep`.
- Inlined in [infra/lib/pulumi-up.ts](infra/lib/pulumi-up.ts#L14) and
  [infra/tasks/install-pulumi-providers.ts](infra/tasks/install-pulumi-providers.ts#L26).

Note: `shared/src/utils/wait-for-backend.ts` also inlines the same one-liner
([shared/src/utils/wait-for-backend.ts](shared/src/utils/wait-for-backend.ts#L16)). A single
`sleep(ms)` in `shared/src/utils` would let infra, cdc and yjs all drop their local copies.

### 3. "Run as main" entry-point guard

Roughly 17 task/lib/compose files guard their CLI entry with a check that the module is the process entry
point — and they use **three different and not-equivalent** spellings:

- `import.meta.url === pathToFileURL(process.argv[1] ?? '').href` — e.g.
  [infra/tasks/print-frontend-build-env.ts](infra/tasks/print-frontend-build-env.ts#L38).
- `process.argv[1] === fileURLToPath(import.meta.url)` — e.g.
  [infra/tasks/setup-vm-key.ts](infra/tasks/setup-vm-key.ts#L50).
- `import.meta.url === \`file://${process.argv[1]}\`` — e.g.
  [infra/lib/ensure-dns-zone.ts](infra/lib/ensure-dns-zone.ts#L126).

Other occurrences include
[infra/tasks/deploy-service.ts](infra/tasks/deploy-service.ts#L147),
[infra/tasks/fetch-boot-diag.ts](infra/tasks/fetch-boot-diag.ts#L215),
[infra/tasks/cutover.ts](infra/tasks/cutover.ts#L346),
[infra/tasks/wait-for-version.ts](infra/tasks/wait-for-version.ts#L243),
[infra/tasks/wait-for-images.ts](infra/tasks/wait-for-images.ts#L179),
[infra/tasks/deploy-rollout.ts](infra/tasks/deploy-rollout.ts#L48),
[infra/tasks/init-stack-secrets.ts](infra/tasks/init-stack-secrets.ts#L87),
[infra/tasks/sync-rollout-config.ts](infra/tasks/sync-rollout-config.ts#L84),
[infra/tasks/install-pulumi-providers.ts](infra/tasks/install-pulumi-providers.ts#L32),
[infra/tasks/smoke.ts](infra/tasks/smoke.ts#L367),
[infra/lib/ensure-edge-plan.ts](infra/lib/ensure-edge-plan.ts#L51),
[infra/compose/synth.ts](infra/compose/synth.ts#L106) and
[infra/agent/src/main.ts](infra/agent/src/main.ts#L33).

A single `isMain(importMetaUrl)` helper (e.g. `infra/lib/is-main.ts`) would standardize the comparison and
remove the subtle differences between the variants.

### 4. Safe JSON body parsing

Identical `body === '' ? {} : JSON.parse(body)` guard:

- [infra/tasks/assert-secrets-deliverable.ts](infra/tasks/assert-secrets-deliverable.ts#L89) (twice).
- [infra/agent/src/runtime-secrets.ts](infra/agent/src/runtime-secrets.ts#L30).

A small `parseJsonBody<T>(body): Partial<T>` helper would centralize this.

### 5. Retry / poll loops

`for (let attempt = 1; attempt <= N; attempt++)` with a delay on failure is hand-rolled in several places:

- [infra/agent/src/boot.ts](infra/agent/src/boot.ts#L61).
- [infra/tasks/install-pulumi-providers.ts](infra/tasks/install-pulumi-providers.ts#L18).
- [infra/tasks/smoke.ts](infra/tasks/smoke.ts#L261).
- [infra/lib/pulumi-up.ts](infra/lib/pulumi-up.ts#L14) (retry on transient failure).

A shared `retry(fn, { attempts, delayMs })` / `pollUntil(...)` helper would remove most of the boilerplate.

### 6. `isRecord` type guard

- [infra/agent/src/plan.ts](infra/agent/src/plan.ts#L61) defines `isRecord(value)`.
- [infra/lib/general-config.ts](infra/lib/general-config.ts#L54) inlines the same `typeof === 'object' && !== null` check.

Candidate for an `infra/lib/guards.ts` (or a `shared/src/utils` guard if reused beyond infra).

### 7. Scaleway credential fallback chains

The `SCW_*_ACCESS_KEY || SCW_ACCESS_KEY || prompt(...)` pattern (and the secret-key/region equivalents) is
repeated across the CLI actions:

- [infra/cli/actions/bake.ts](infra/cli/actions/bake.ts#L57).
- [infra/cli/actions/preview.ts](infra/cli/actions/preview.ts#L26).
- [infra/cli/actions/apply.ts](infra/cli/actions/apply.ts#L32).
- [infra/cli/actions/secrets.ts](infra/cli/actions/secrets.ts#L50).

`infra/lib/bootstrap-scw-env.ts` already centralizes `resolveProjectId()`; the credential resolution could be
folded in next to it (e.g. `resolveScwCredentials()`), with the CLI actions supplying the prompt callback.

### 8. `Usage: ...` error strings

Scattered `throw new Error('Usage: ...')` with no shared formatting:
[infra/tasks/wait-for-version.ts](infra/tasks/wait-for-version.ts#L196),
[infra/tasks/deploy-service.ts](infra/tasks/deploy-service.ts#L85),
[infra/tasks/fetch-boot-diag.ts](infra/tasks/fetch-boot-diag.ts#L202),
[infra/tasks/print-frontend-build-env.ts](infra/tasks/print-frontend-build-env.ts#L32),
[infra/agent/src/main.ts](infra/agent/src/main.ts#L8). Low priority — best co-located with the arg helper.

## Replaceable by existing `shared/` code

These already have a home in `shared/` and just need infra to import it instead of re-declaring.

### A. Divider line → `DIVIDER` from `shared/cli-utils/display`

`shared/cli-utils/display.ts` already exports `DIVIDER = '─'.repeat(60)` plus `printHeader`, `printStep` and
`printError` ([shared/src/cli-utils/display.ts](shared/src/cli-utils/display.ts#L4)). The infra CLI header
already uses `printHeader` ([infra/cli/infra-cli.ts](infra/cli/infra-cli.ts#L67)), but three places still
re-declare the divider locally:

- [infra/cli/actions/setup.ts](infra/cli/actions/setup.ts#L255) — `pc.dim('─'.repeat(60))`.
- [infra/tasks/setup-ci-key.ts](infra/tasks/setup-ci-key.ts#L56) — `DIVIDER = pc.dim('─'.repeat(60))`.
- [infra/tasks/setup-vm-key.ts](infra/tasks/setup-vm-key.ts#L77) — `DIVIDER = pc.dim('─'.repeat(60))`.

Replace with `import { DIVIDER } from 'shared/cli-utils/display'` (wrapping with `pc.dim(...)` at the call site
if the dim styling is desired). The `printStep` / `printError` helpers can also replace some of the ad-hoc
status lines in these `setup-*` scripts.

### B. Ad-hoc check/cross marks → `shared/console`

`shared/console` already exports `checkMark`, `crossMark`, `warningMark`, `tildeMark`, `changeMark`
([shared/src/utils/console.ts](shared/src/utils/console.ts#L4)), and most of infra already uses them. The
remaining ad-hoc spots use raw glyphs or re-color them inline:

- [infra/cli/shared.ts](infra/cli/shared.ts#L93) — raw `✗` / `→` in `createStepRunner` instead of `crossMark`.
- The `setup-*` scripts mix `pc.green('✓')` / `pc.red('✗')` with the shared marks.

Standardizing on `shared/console` keeps the glyph + color choices in one place.

### C. `infraDir` path resolution → `infra/lib/paths.ts`

`infra/lib/paths.ts` already exports `infraDir`
([infra/lib/paths.ts](infra/lib/paths.ts#L5)). Several files still re-derive it with
`resolve(dirname(fileURLToPath(import.meta.url)), '..')` (or a `../..` variant), e.g.
[infra/lib/bootstrap-scw-env.ts](infra/lib/bootstrap-scw-env.ts#L13) and
[infra/compose/synth.ts](infra/compose/synth.ts#L81). Importing `infraDir`/path helpers from `lib/paths.ts`
avoids the `../` vs `../..` drift seen in the test files.

## Suggested approach

A pragmatic, low-risk ordering:

1. Create `infra/lib/` micro-utils that have no shared equivalent: `is-main.ts`, `guards.ts`, and extend the
   existing `tasks/args.ts` (or a neutral `lib/args.ts`) to also export `sleep` + `retry`/`pollUntil` and
   `parseJsonBody`. Migrate call sites incrementally.
2. Swap the locally-declared dividers and ad-hoc marks for the existing `shared/cli-utils/display` and
   `shared/console` exports.
3. Replace local `infraDir` derivations with `infra/lib/paths.ts`.
4. Consider promoting `sleep` (and possibly `retry`) into `shared/src/utils` since `shared/src/utils/wait-for-backend.ts`,
   `cdc/` and `yjs/` inline the same one-liner.

Each step is independently testable; the `*.test.ts` files already present in `infra/lib` and `infra/tasks`
give good coverage for the migrations.
