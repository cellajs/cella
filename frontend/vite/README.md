# Frontend Vite plugins

The frontend Vite config treats documentation as content, not application source. Markdown and MDX files under `src/content/docs` become lazy React page chunks. Thin MDX pages may import repository documents so canonical engineering docs appear in the app without copying.

`docs-frontmatter.ts` builds three virtual modules without importing page components: `virtual:docs-frontmatter` holds page metadata and headings for navigation; `virtual:docs-search-sections` holds bounded plaintext sections loaded only by search; `virtual:docs-sizes` holds each page's character and word count, loaded only by the pages table. Heading extraction must match the MDX `rehype-slug` config in `vite.config.ts`, including its `spy-` prefix and per-file GitHub slugger state.

Wrapper pages combine their own metadata with imported repository documents. `updatedAt` is the newest of the frontmatter `updatedAt` stamp and the commit dates of the wrapper and imported bodies, so a stamp written by the editor counts only until a later commit overtakes it; filesystem mtime is the fallback for untracked files and repos without usable Git history.

Development builds add `docs-editor.ts`, which lets the pages table rewrite frontmatter and move files under `src/content/docs`. Moving a page changes its parent because the content directory is the hierarchy. The frontmatter watcher rebuilds the virtual indexes after each write and sends the new page index and sizes to the open app, which updates the table, the sidebar and the page in place. Only an edit to the root `index.mdx` reloads the app, as the docs config it holds is read once. Production builds have no editing endpoint.

`remark-link-repo-paths.ts` links inline repository paths and relative links in imported repository documents to GitHub, validating every target against the repository root first. Content-root documents keep their authored application routes.

`router-options.ts` holds the file-based routing options for the TanStack Router plugin, and `generate-routes.ts` (`pnpm gen:routes`) runs the same generator on them without a build or dev server.

`locales-plugin.ts` is separate from the docs pipeline: it builds and serves the merged locale namespaces (`../../locales/README.md`) and sends `i18next-hmr:update` on locale changes so the client reloads resources without a full refresh.

`react-compiler-guard.ts` makes the React Compiler's silent choices visible. The compiler skips a component or hook that breaks a rule of React or that it cannot handle yet, and that function then runs without memoization. A production build fails on every skipped function that no allowlist names, printing each one with the compiler's reason and line, and the dev server warns once per file. The build also fails when nothing compiled at all, so a babel `include` that stops matching files cannot switch the compiler off unnoticed.

An allowlist maps `<file>:<function>` (the file relative to `frontend/`) to a one-line reason why it stays. `react-compiler-allowlist.json` holds the template's entries and reaches every app with the sync. `react-compiler-allowlist.app.json` is app-owned: an app lists its own files there, and has no file while it needs none. An entry that compiles again only warns, so a fix in the template never breaks an app's build. The build sees only the modules the app imports: a template file the template itself never imports, such as the board layout, is checked in the apps that use it. A function the compiler never tries, such as a hook that calls hooks only inside a loop, raises nothing; it states that with `'use no memo'` and its reason.

`jspdf-optional-stub.ts` is what jspdf's `.html()` and SVG image paths import: the table export uses neither, so their packages (`canvg`, `html2canvas`) are not installed and `vite.config.ts` aliases them here.

`index-html.ts` fills the `<%= key %>` placeholders in `index.html` from appConfig and, in a build, drops its comments and the whitespace between tags. `sdk-static.ts` serves the API docs files at `/static/` and emits them there in a build: `openapi.json`, `zod.gen.ts` and `types.gen.ts` from `sdk/gen`, and `docs.gen/`, which it derives from that spec.
