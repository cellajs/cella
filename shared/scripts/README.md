# shared/scripts

The repo checks: the commands that gate a commit, a PR and a release, in the template and in every app that syncs this folder, and the rule modules of the style check. Every file runs on `node` as written (type stripping), so relative imports carry `.ts`. A module the style check imports sits at the top of this folder: the style test copies the folder's top level into a scratch repository.

`check-<subject>.ts` is a command. `<subject>-rules.ts` is a rule module of the style check and exports `<subject>Findings`. `check-app-vocabulary.ts` is a rule module that keeps a command's name, because the app-owned `shared/config/vocabulary-allowlist.ts` imports its type by that path.

## Commands

| Script | What it checks | Who runs it |
| --- | --- | --- |
| `check-style.ts` | The style check: the rule modules below over every file git lists, untracked ones it does not ignore included. Exits 1 on any finding. Path arguments limit the files read. | `pnpm style [paths…]`. `pnpm lint`, `pnpm lint:fix` and `pnpm check` run it, and the CI lint job on every PR. |
| `check-lenses.ts` | The schema-evolution lenses in `shared/src/schema-evolution/` ([CI guards](../../cella/SCHEMA_EVOLUTION.md#ci-guards)): a dated lens module never changes after its first commit; no lens touches a frozen envelope field, a field the CDC counters read or an embedding host column; a contract lens follows an expand lens on the same field; a lens module neither awaits nor imports dynamically; every configured entity type calls its `evolutionContract` factory in `backend/src/modules`. | `pnpm --filter shared lens:check`. `pnpm check` runs it, and the CI lint job on every PR, with full history for the append-only compare. |
| `check-config-shape.ts` | Both config-shape runs, on the leaves `write-template-config.ts` declares. `template` writes `config.template.ts` over `config.default.ts` as the scaffolder does, regenerates the SDK and runs `pnpm ts`; `--tests` adds the sign-in, connections and SSO federation client suites. `app` edits both config files to an app's shape (listed surfaces, another feature flag, a stricter member policy) and runs the core suites, so a template test that only passes on the template's own values fails before an app's sync finds it. Restores `shared/config` (and `sdk/gen` under `template`) from git afterwards, so both must be committed. Passes at once in an app, which has no `config.template.ts`. | `pnpm template:check [--tests]` (CI build-services, every PR) and `pnpm app-shape:check` (CI test job, on the release PR and an app's upgrade PR). |
| `check-service-boot.ts` | Boots the built bundles as their images do: each from a copy of its `dist` beside only its `dependencies`, outside the repo, so a bare import of a package the image lacks fails as it would in a deploy. Runs the backend's migrate service, which also seeds the admin, then starts the API, the CDC worker and the Yjs relay until each is healthy and stops them. Development mode, on a scratch database of the test server that it drops afterwards, on this checkout's dev ports (`DEV_PORT_OFFSET` moves them). | `pnpm build`, then `pnpm boot:check` (starts the test database); `DB_TEST_PORT=<port> node shared/scripts/check-service-boot.ts` for another server. The CI build-services job runs it on every PR, after the build. |
| `write-template-config.ts` | Renders `config.template.ts`, the scaffolder's template, from `config.default.ts` and the template leaves it declares: the app's identity, the fresh-app starting values and the empty federation example. The config template test fails while the file is stale. It also renders the app shape in memory, so a moved leaf fails the PR that moves it. Does nothing in an app, which has no template. | `pnpm template:write`; `pnpm check` runs it. |

The tests beside these files run in the `shared` suite (`pnpm --filter shared test`); CI runs them in the full test job, on the release PR and on an app's upgrade PR.

## Style rule modules

| Module | What it checks |
| --- | --- |
| `prose-rules.ts` | The prose rules, each a pattern, a level, its advice and what it reads (see the rule table below). No rule reads migrations, `cella/alignments/`, generated code or the changelogs; an app adds its own paths under `proseExclude`. |
| `comment-rules.ts` | Applies the prose rules and the long-comment rule to source and config files, CSS, SQL, YAML, Dockerfiles and `.env*` files included. |
| `source-comments.ts` | The comments of a source file, by language, and the one TypeScript parse the rules of a file share. |
| `doc-rules.ts` | Applies the `docs` prose rules to Markdown and MDX prose, code and link targets masked, and refuses inline code in a link label. |
| `check-app-vocabulary.ts` | Template and app vocabulary from `cella/AGENTS.md`: the `source-control-term` and `product-name` rules below. An app adds exceptions, `proseExclude` and `markerClasses` in `shared/config/vocabulary-allowlist.ts`. |
| `frontend-rules.ts` | Frontend conventions Biome cannot express, in the frontend sources: the scripts under `frontend/src` outside generated files, content, stories and tests. |
| `tailwind-class-rules.ts` | Frontend class names that compile to no CSS, checked against the Tailwind design system of the stylesheet that imports `tailwindcss`. A class that a stylesheet, a script or an arbitrary selector such as `group-[.x]` uses passes; another intentional marker goes in `markerClasses`, here for template hooks or in `shared/config/vocabulary-allowlist.ts` for the app's own. |
| `text-color-rules.ts` | The four text steps, which increased contrast can raise: a text token takes no opacity modifier, and a palette gray skips the theme. |
| `token-contrast-rules.ts` | The color token pairs of `frontend/src/styling/tailwind.css` in light and dark mode, text and the raised control edge (`--edge-raised`) alike, against WCAG's ratios, so a token that fails is caught before any page is opened. |
| `stamp-rules.ts` | Row stamps in `backend/src`: a moment comes from `getIsoDate()`, a row's last writer and tombstone from `updateStamps()` / `deleteStamps()`. |
| `alignment-rules.ts` | The folder and README shape of an [alignment](../../cella/alignments/README.md), which `pnpm cella align` reads. In the template, also the alignment a branch owes when it changes an app-owned path template code reads from, unless a commit message carries `Alignment: none, <reason>`. |
| `class-tokens.ts` | Splits a class token into its variants and utility, and lists the tokens of every string under a node, for the Tailwind and text color rules. |
| `repo-files.ts` | The file list, path filters, positions and finding shape the rules share, and `withRestoredPaths`, which the two config checks run their swap in. |

## Rules

Every rule fails `pnpm style`.

| Rule | Fails on | Where |
| --- | --- | --- |
| `em-dash` | an em dash | source and config files, strings, JSON values and `.env*` files included; Markdown and MDX prose |
| `contrast-phrase` | `instead`, `rather than`, `as opposed to` | comments |
| `change-history` | `previously`, `formerly`, `used to`, `originally` | comments |
| `review-conversation` | `maybe`, `perhaps`, `we should`, `we could`, `we might`, `was considered` | comments |
| `concrete-language` | `invariant` | comments, Markdown and MDX prose |
| `load-bearing`, `authoritative` | the word the rule is named after | comments, Markdown and MDX prose, outside `infra/` and `cella/alignments/` |
| `detached-long-comment` | a comment of more than three prose lines outside a statement and not directly above a declaration; a licence header passes | source and config files |
| `code-in-link` | inline code in a link label | Markdown and MDX |
| `source-control-term` | the CLI's source-control term | file paths and text, outside the sync markers and the allowlisted files |
| `product-name` | `cella_*`, `Cella*`, `_cella-*`, `cellajs.com` | `backend/src`, `shared/src` and `frontend/src`, outside tests, marketing and content |
| `component-declaration` | a component declared as an arrow function, or a helper such as `memo` wrapping an unnamed render function | frontend `.tsx` sources |
| `react-component-type` | `FC` or `FunctionComponent` | frontend sources |
| `store-selector` | a zustand store called without a selector | frontend sources |
| `route-context-selector` | `useRouteContext()` without `select` | frontend sources |
| `button-press-cancel` | `active:translate-y-0` on a `Button`, which leaves the press nudge in place | frontend sources |
| `form-no-validate` | a form react-hook-form validates without `noValidate` | frontend sources |
| `form-resolver` | an import from `@hookform/resolvers/zod` | frontend sources outside `utils/form-resolver.ts` |
| `reorder-grip` | a lucide grip icon in a file that imports no `ReorderHandle` or `reorderColumn` | frontend sources outside drag previews and the editor's side menu |
| `memo-dependency-unread` | a `useMemo` or `useCallback` dependency its callback never reads | frontend sources |
| `tailwind-class` | a class that compiles to no CSS and that nothing selects, a variant on a plain CSS class, a stylesheet Tailwind cannot load | `frontend/src` scripts outside tests, and the Tailwind entry stylesheet |
| `text-color` | a text token with an opacity modifier outside `disabled:`, a palette gray | frontend sources; palette grays pass in the docs module and the JSON viewer theme |
| `token-contrast` | a token pair below its WCAG ratio, a theme without `--background` or `--edge-raised` | `frontend/src/styling/tailwind.css` |
| `stamp-clock` | `new Date().toISOString()` | `backend/src`, outside tests, mock builders and the two stamp helpers |
| `stamp-pair` | an object that writes `updatedAt` with `updatedBy`, or `deletedAt` with `deletedBy`, from a moment written by hand | `backend/src`, outside tests, mock builders and the two stamp helpers |
| `alignment` | an alignment folder off its shape; in the template, a changed app-owned path with no alignment or waiver | `cella/alignments/`; the branch against `origin/main` |
| `path-argument` | a path argument that matches no file | the arguments of `pnpm style` |

## Other repo tools

Two tools that live outside this folder:

| Tool | Purpose | Invocation |
| --- | --- | --- |
| Bundle treemap (`frontend/vite.config.ts`) | Per-module view of the shipped frontend chunks, to check which chunk holds a package. | `pnpm deps:bundle:analyze` builds with `ANALYZE=true`, which loads `rollup-plugin-visualizer` and writes `frontend/stats/bundle.html`. |
| knip (`knip.jsonc`) | Unused files and dependencies. A file cella itself never imports but an app does is an `entry`; string-resolved packages knip cannot see (pino transport target in `shared/src/pino.ts`) sit under `ignoreDependencies`. | `pnpm unused` |
