# shared/scripts

| Script | Purpose | Invocation |
| --- | --- | --- |
| `check-doc-style.ts` | CI guard for concrete terminology in authored Markdown and MDX; exits 1 with file and line diagnostics when prose should name a more precise rule, constraint, guarantee, requirement, contract, precondition, or assumption. | `pnpm docs:style`. `pnpm prose:check` runs `pnpm style` (terminology + documentation + all comment rules including placement), the blocking entry point for CI and `pnpm check`. |
| `check-app-vocabulary.ts` | Enforces the template/app vocabulary rule in `cella/AGENTS.md`. | `pnpm vocabulary:check` |
| `check-lenses.ts` | Guards the schema-evolution lens system in `shared/src/schema-evolution/`; exits 1 on any violation ([CI guards](../../cella/SCHEMA_EVOLUTION.md#ci-guards)). | `pnpm --filter shared lens:check` |
| `wait-backend.ts` | Waits for the backend health endpoint. | `tsx shared/scripts/wait-backend.ts [-i interval] [-t timeout]` |
| `deps-report.ts` | Dependency count and install weight over the pnpm graph; no dependencies of its own, no CI gate. | `pnpm deps`. Flags: `--workspace <name>` limits the run, `--top <n>` ranking length, `--json <path>` writes a snapshot. |
| `bundle-report.ts` | Shipped frontend bundle size over `frontend/dist`, source maps excluded. | `pnpm deps:bundle` after `pnpm --filter frontend build`, or `pnpm deps:bundle:analyze` to build and report together. `pnpm deps:bundle:check` = the report with `--max-critical-kb` and `--assert-lazy`. Flags: `--top <n>`, `--json <path>`, `--max-critical-kb <n>` (brotli kB), `--assert-lazy`. |
| knip (`knip.json`) | Unused dependencies; string-resolved ones knip cannot see (pino transport target in `shared/src/pino.ts`, artillery CLI spawned by `bench/src/bench-cli.ts`) sit under `ignoreDependencies`. | `pnpm deps:unused` |

## deps-report.ts output

Per workspace (each listed separately; `pnpm list -r` truncates shared subtrees): direct dependency counts (prod + dev), transitive closure size, unpacked bytes on disk. The ranking sorts direct dependencies by **exclusive subtree**, the packages reachable through that dependency alone: what removing it reclaims.

## bundle-report.ts output

Raw, gzip and brotli totals, a breakdown by file type, and the **critical path**: every chunk statically reachable from the entry script. The graph derives from the chunks' own static imports and warns when `modulepreload` links drift from it. Chunk grouping in `frontend/vite.config.ts` moves the numbers most: a group captures the dependencies of whatever it matches. `--assert-lazy` fails when a boot chunk's source map contains an on-demand package: @blocknote, @uppy, pdfjs, media-chrome, gleap, shiki grammars, react-scan.

`pnpm deps:bundle:analyze` also sets `ANALYZE=true`, enabling `rollup-plugin-visualizer` in `frontend/vite.config.ts` (never loaded otherwise), which writes a per-module treemap to `frontend/stats/bundle.html`.
