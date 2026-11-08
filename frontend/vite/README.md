# Frontend Vite plugins

The frontend Vite config treats documentation as content, not application source. Markdown and MDX files under `src/content/docs` become lazy React page chunks. Thin MDX pages may import repository documents so canonical engineering docs appear in the app without copying.

`docs-frontmatter.ts` builds three virtual modules without importing page components: `virtual:docs-frontmatter` holds page metadata and headings for navigation; `virtual:docs-search-sections` holds bounded plaintext sections loaded only by search; `virtual:docs-sizes` holds each page's character and word count, loaded only by the pages table. Heading extraction must match the MDX `rehype-slug` config in `vite.config.ts`, including its `spy-` prefix and per-file GitHub slugger state.

Wrapper pages combine their own metadata with imported repository documents. `updatedAt` is the newest of the frontmatter `updatedAt` stamp and the commit dates of the wrapper and imported bodies, so a stamp written by the editor counts only until a later commit overtakes it; filesystem mtime is the fallback for untracked files and repos without usable Git history. `git-updated-at.ts` resolves those dates.

The route map for imported repository documents derives from the wrapper pages' own imports (`repoDocRouteMap`), so a moved document cannot leave a stale route.

`llms-txt.ts` renders `llms.txt` and a Markdown copy of each page from the same walk, served in dev and emitted in a build for crawlers.

Development builds add `docs-editor.ts`, which lets the pages table rewrite frontmatter and move files under `src/content/docs`. Moving a page changes its parent because the content directory is the hierarchy. Production builds have no editing endpoint.

The frontmatter watcher rebuilds the virtual indexes after each write and sends the new page index and sizes to the open app, which updates the table, the sidebar and the page in place. Only an edit to the root `index.mdx` reloads the app, as the docs config it holds is read once.

`remark-link-repo-paths.ts` links inline repository paths and relative links in imported repository documents to GitHub, validating every target against the repository root first. Content-root documents keep their authored application routes.

`router-options.ts` holds the file-based routing options for the TanStack Router plugin, and `generate-routes.ts` (`pnpm generate:routes`) runs the same generator on them without a build or dev server.

`locales-plugin.ts` is separate from the docs pipeline: at every start and build it writes `shared/locales/resources.gen.d.ts`, the English texts as types, and in dev the merged locale cache that i18n Ally reads (`../../shared/locales/README.md`). `write-locale-types.ts` writes the same types without Vite, for the install and the typecheck, since the file is not in git. The app itself bundles and lazy-loads locales as modules (`src/lib/i18n-locales.ts`), so other languages ship as hashed chunks the service worker precaches.

The React Compiler runs natively, through `react({ compiler })` and the `oxc-transform-react` package, with `panicThreshold: 'all_errors'` (`vite.config.ts`): a component or hook it cannot compile fails the dev transform and the build with the compiler's reason, never running unmemoized unseen. It covers every module `react()` includes, route code that TanStack splits off included.

A function that must stay uncompiled states `'use no memo'` as its first statement, with the reason as a comment above the directive. A small inline build plugin still fails when nothing compiled at all, so a `react()` include or compiler option that stops reaching the app's files cannot switch the compiler off unnoticed.

The dev server transforms the static import graph of `src/main.tsx` at startup (`server.warmup`), so the first page load after `pnpm dev` finds it done. `@serwist/window` is listed in `optimizeDeps.include` because only `virtual:serwist` imports it, and the dependency scan cannot follow a virtual module: found at runtime, it would re-bundle every dependency mid-load and reload the page.

`jspdf-optional-stub.ts` is what jspdf's `.html()` and SVG image paths import: the table export uses neither, so their packages (`canvg`, `html2canvas`) are not installed and `vite.config.ts` aliases them here.

`index-html.ts` fills the `<%= key %>` placeholders in `index.html` from appConfig. `precompress.ts` writes a Brotli copy beside each built asset, which the deploy serves as-is. `stop-vite.ts` is `pnpm stop` for this checkout's dev server. `sdk-static.ts` serves the API docs files at `/static/` and emits them there in a build: `openapi.json`, `zod.gen.ts` and `types.gen.ts` from `sdk/gen`, and `docs.gen/`, which it derives from that spec.
