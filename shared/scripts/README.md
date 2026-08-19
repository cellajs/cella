# shared/scripts

## check-doc-style.ts

CI guard for concrete terminology in authored Markdown and MDX. Run via `pnpm docs:style`; exits 1 with file and line diagnostics when prose should name a more precise rule, constraint, guarantee, requirement, contract, precondition, or assumption. `pnpm prose:check` runs `pnpm style` (terminology + documentation + all comment rules including placement), which is the blocking entry point for both CI and `pnpm check`.

`pnpm vocabulary:check` rejects source-control-oriented template terminology in paths and tracked
text. The Cella CLI configuration and migration compatibility instructions are explicit exceptions.

## check-lenses.ts

CI guard for the schema-evolution lens system in `shared/src/schema-evolution/`. Run via `pnpm --filter shared lens:check`; exits 1 on any violation.

Checks:

1. **Append-only lint**: dated lens module files must never change after their first commit (frozen). `lens-list.ts`, `define.ts`, and `engine.ts` are exempt.
2. **Config-collision validator**: a lens delta must not touch frozen-envelope fields, CDC counter fields, or declared entity-embedding host columns.
3. **Lens purity lint**: dated lens modules must be pure (no `await`, no dynamic `import()`, no value-dependent dynamic key access).
4. **Contract completeness**: every configured product/channel entity type must register through the
   `evolutionContract` factory in `backend/src/modules/`; `lens:check` fails if an entity omits its
   widening or normalization entry point.

## wait-backend.ts

Waits for the backend health endpoint before proceeding. Usage: `tsx shared/scripts/wait-backend.ts [-i interval] [-t timeout]`.

## deps-report.ts

Dependency count and install weight over the pnpm graph. Run via `pnpm deps`; no dependencies of its
own, no CI gate. Reports per workspace: direct dependency counts (prod + dev), the size of the
transitive closure, and unpacked bytes on disk. Because `pnpm list -r` prints each subtree only under
the first importer that reaches it, the script lists every workspace separately so no tree is
truncated.

The ranking below each table is the actionable part: direct dependencies sorted by **exclusive
subtree** — the packages reachable through that dependency and no other direct dependency of the same
workspace. That is what removing it would actually reclaim, as opposed to its total reach, which
double-counts packages several dependencies share.

Flags: `--workspace <name>` limits the run, `--top <n>` sets the ranking length, `--json <path>`
writes a snapshot for tracking counts and bytes over time.

## bundle-report.ts

Shipped-bundle size for the frontend. Run via `pnpm deps:bundle` after `pnpm --filter frontend build`,
or `pnpm deps:bundle:analyze` to build and report in one step. Reports raw, gzip, and brotli totals
over `frontend/dist` with source maps excluded, a breakdown by file type, and the **critical path** —
every chunk statically reachable from the entry script. A browser fetches, parses and evaluates all of
it before the entry module body runs; route chunks behind a dynamic import wait for a route that asks
for them. `modulepreload` links are only a hint, so the report derives the graph from the chunks' own
static imports and warns when the two have drifted.

`pnpm deps:bundle:check` re-runs the report with `--max-critical-kb` and `--assert-lazy`, and exits
non-zero when the critical path grows past the budget or a feature library turns up on it. Chunk
grouping in `frontend/vite.config.ts` is what mainly moves both numbers: a group captures the
dependencies of whatever it matches, so a package can join a boot chunk with no import pointing at
it, and reordering two groups moves the critical path by hundreds of kB. `--assert-lazy` reads the
source maps of every boot chunk and fails when one contains a package the app only reaches on
demand — @blocknote, @uppy, pdfjs, media-chrome, gleap, shiki grammars, react-scan.

`pnpm deps:bundle:analyze` also sets `ANALYZE=true`, which enables `rollup-plugin-visualizer` in
`frontend/vite.config.ts` and writes a per-module treemap to `frontend/stats/bundle.html`. Normal
builds never load that plugin.

Flags: `--top <n>` sets the chunk-ranking length, `--json <path>` writes a snapshot,
`--max-critical-kb <n>` fails the run when the critical path exceeds that many kB brotli, and
`--assert-lazy` fails it when an on-demand package is reachable before boot.

## Unused dependencies

`pnpm deps:unused` runs knip against `knip.json`. Dependencies resolved by string rather than by
import — the pino transport target in `shared/src/pino.ts`, the artillery CLI spawned by
`bench/src/bench-cli.ts` — are listed under `ignoreDependencies` because knip cannot see them.
