# Frontend Vite plugins

The frontend Vite config treats documentation as content, not application source. Markdown and MDX files under `src/content/docs` become lazy React page chunks. Thin MDX pages may import repository documents so canonical engineering docs appear in the app without copying.

`docs-frontmatter.ts` builds two virtual modules without importing page components: `virtual:docs-frontmatter` holds page metadata and headings for navigation; `virtual:docs-search-sections` holds bounded plaintext sections loaded only by search. Heading extraction must match the MDX `rehype-slug` config in `vite.config.ts`, including its `spy-` prefix and per-file GitHub slugger state.

Wrapper pages combine their own metadata with imported repository documents. `updatedAt` is the newest commit date across the wrapper and imported bodies unless frontmatter pins a date; filesystem mtime is the fallback for untracked files and repos without usable Git history.

Development builds add `docs-editor.ts`, which lets the pages table rewrite frontmatter and move files under `src/content/docs`. Moving a page changes its parent because the content directory is the hierarchy. The frontmatter watcher rebuilds the virtual indexes and reloads the page after each write. Production builds have no editing endpoint.

`remark-link-repo-paths.ts` links inline repository paths and relative links in imported repository documents to GitHub, validating every target against the repository root first. Content-root documents keep their authored application routes.

`locales-plugin.ts` is separate from the docs pipeline. It merges locale namespaces (`common` + `app` → `c`) into the configured cache, serves it at `/locales/{lng}/{ns}.json` in dev, emits it as build assets, and sends `i18next-hmr:update` on locale changes so the client reloads resources without a full refresh. i18n Ally reads the same cache (see `locales/README.md`).
