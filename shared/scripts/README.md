# shared/scripts

The repo checks: the commands that gate a commit, a PR and a release, in the template and in every app that syncs this folder. Every file runs on `node` as written (type stripping), so relative imports carry `.ts`. `check-<subject>.ts` is a command.

## Commands

| Script | What it checks | Who runs it |
| --- | --- | --- |
| `check-lenses.ts` | The schema-evolution lenses in `shared/src/schema-evolution/` ([CI guards](../../cella/SCHEMA_EVOLUTION.md#ci-guards)): a dated lens module never changes after its first commit; no lens touches a frozen envelope field, a field the CDC counters read or an embedding host column; a contract lens follows an expand lens on the same field; a lens module neither awaits nor imports dynamically; every configured entity type calls its `evolutionContract` factory in `backend/src/modules`. | `pnpm --filter shared lens:check`. `pnpm check` runs it, and the CI lint job on every PR, with full history for the append-only compare. |
| `check-config-shape.ts` | Both config-shape runs, on the leaves `write-template-config.ts` declares. `template` writes `config.template.ts` over `config.default.ts` as the scaffolder does, regenerates the SDK and runs `pnpm ts`; `--tests` adds the sign-in, connections and SSO federation client suites. `app` edits both config files to an app's shape (listed surfaces, another feature flag, a stricter member policy) and runs the core suites, so a template test that only passes on the template's own values fails before an app's sync finds it. Restores `shared/config` (and `sdk/gen` under `template`) from git afterwards, so both must be committed. Passes at once in an app, which has no `config.template.ts`. | `pnpm template:check [--tests]` (CI build-services, every PR) and `pnpm app-shape:check` (CI test job, on the release PR and an app's upgrade PR). |
| `check-service-boot.ts` | Boots the built bundles as their images do: each from a copy of its `dist` beside only its `dependencies`, outside the repo, so a bare import of a package the image lacks fails as it would in a deploy. Runs the backend's migrate service, which also seeds the admin, then starts the API, the CDC worker and the Yjs relay until each is healthy and stops them. Development mode, on a scratch database of the test server that it drops afterwards, on this checkout's dev ports (`DEV_PORT_OFFSET` moves them). | `pnpm build`, then `pnpm boot:check` (starts the test database); `DATABASE_TEST_PORT=<port> node shared/scripts/check-service-boot.ts` for another server. The CI build-services job runs it on every PR, after the build. |
| `write-template-config.ts` | Renders `config.template.ts`, the scaffolder's template, from `config.default.ts` and the template leaves it declares: the app's identity, the fresh-app starting values and the empty federation example. The config template test fails while the file is stale. It also renders the app shape in memory, so a moved leaf fails the PR that moves it. Does nothing in an app, which has no template. | `pnpm template:write`; `pnpm check` runs it. |
| `kill-ports.ts` | Nothing: it ends every listener on this checkout's dev ports, the offset applied, so the services, Vite, Storybook and Drizzle Studio stop and the database container stays. | `pnpm killports` |

## Other repo tools

Tools that live outside this folder:

| Tool | Purpose | Invocation |
| --- | --- | --- |
| Style check (`@cellajs/cli`) | Terminology, docs, comments and frontend conventions Biome cannot express, over every file git lists; exits 1 on any finding. Its rules, and the exceptions an app lists in `shared/config/vocabulary-allowlist.ts`: [Style](https://github.com/cellajs/cella-cli#style). | `pnpm cella style [paths…]`. `pnpm lint:fix` and `pnpm check` run it, and the CI lint job on every PR. |
| Bundle treemap (`frontend/vite.config.ts`) | Per-module view of the shipped frontend chunks, to check which chunk holds a package. | `pnpm deps:bundle:analyze` builds with `ANALYZE=true`, which loads `rollup-plugin-visualizer` and writes `frontend/stats/bundle.html`. |
| knip (`knip.jsonc`) | Unused files and dependencies. A file cella itself never imports but an app does is an `entry`; string-resolved packages knip cannot see (pino transport target in `shared/src/pino.ts`) sit under `ignoreDependencies`. | `pnpm unused` |
