# shared/scripts

| Script | Purpose | Invocation |
| --- | --- | --- |
| `check-doc-style.ts` | CI guard for concrete terminology in authored Markdown and MDX; exits 1 with file and line diagnostics when prose should name a more precise rule, constraint, guarantee, requirement, contract, precondition, or assumption. | `pnpm docs:style`. `pnpm prose:check` runs `pnpm style` (terminology + documentation + all comment rules including placement), the blocking entry point for CI and `pnpm check`. |
| `check-app-vocabulary.ts` | Enforces the template/app vocabulary rule in `cella/AGENTS.md`. | `pnpm vocabulary:check` |
| `prose-rules.ts` | The rules the comment and doc checks share. An app skips paths in both with `proseExclude` in `shared/config/vocabulary-allowlist.ts`. | Imported by both checks |
| `check-lenses.ts` | Guards the schema-evolution lens system in `shared/src/schema-evolution/`; exits 1 on any violation ([CI guards](../../cella/SCHEMA_EVOLUTION.md#ci-guards)). | `pnpm --filter shared lens:check` |
| `wait-backend.ts` | Waits for the backend health endpoint. | `tsx shared/scripts/wait-backend.ts [-i interval] [-t timeout]` |
| Bundle treemap (`frontend/vite.config.ts`) | Per-module view of the shipped frontend chunks, to check which chunk holds a package. | `pnpm deps:bundle:analyze` builds with `ANALYZE=true`, which loads `rollup-plugin-visualizer` and writes `frontend/stats/bundle.html`. |
| knip (`knip.json`) | Unused dependencies; string-resolved ones knip cannot see (pino transport target in `shared/src/pino.ts`, artillery CLI spawned by `bench/src/bench-cli.ts`) sit under `ignoreDependencies`. | `pnpm deps:unused` |

