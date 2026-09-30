# shared/scripts

| Script | Purpose | Invocation |
| --- | --- | --- |
| `check-style.ts` | The style check: one pass over the repo files, each finding printed as `file:line:column [rule] "term": message`. Blocking in `pnpm lint`, `pnpm check` and CI. | `pnpm style [paths…]`; `pnpm style:audit` also lists review markers, which never fail. |
| `check-app-vocabulary.ts` | Template/app vocabulary and product-name rules from `cella/AGENTS.md`. An app adds exceptions, and `proseExclude` prefixes for the prose rules, in `shared/config/vocabulary-allowlist.ts`. | Run by `check-style.ts` |
| `prose-rules.ts` | The prose rules: every rule reads source comments (`check-comment-style.ts`, which also checks comment placement, and `source-comments.ts`), `docs` rules also Markdown and MDX (`check-doc-style.ts`). | Run by `check-style.ts` |
| `check-frontend-style.ts` | Frontend conventions Biome cannot express: named function components, no `FC`, zustand stores read through a selector. | Run by `check-style.ts` |
| `check-lenses.ts` | Guards the schema-evolution lens system in `shared/src/schema-evolution/`; exits 1 on any violation ([CI guards](../../cella/SCHEMA_EVOLUTION.md#ci-guards)). | `pnpm --filter shared lens:check` |
| `wait-backend.ts` | Waits for the backend health endpoint. | `tsx shared/scripts/wait-backend.ts [-i interval] [-t timeout]` |
| Bundle treemap (`frontend/vite.config.ts`) | Per-module view of the shipped frontend chunks, to check which chunk holds a package. | `pnpm deps:bundle:analyze` builds with `ANALYZE=true`, which loads `rollup-plugin-visualizer` and writes `frontend/stats/bundle.html`. |
| knip (`knip.json`) | Unused dependencies; string-resolved ones knip cannot see (pino transport target in `shared/src/pino.ts`, artillery CLI spawned by `bench/src/bench-cli.ts`) sit under `ignoreDependencies`. | `pnpm deps:unused` |

