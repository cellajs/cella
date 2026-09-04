# Frontend Vite plugins

The frontend Vite config treats documentation as content, not application source. Markdown and MDX files under `src/content/docs` become lazy React page chunks. Thin MDX pages may import repository documents so canonical engineering docs appear in the app without copying.

`docs-frontmatter.ts` builds two virtual modules without importing page components: `virtual:docs-frontmatter` holds page metadata and headings for navigation; `virtual:docs-search-sections` holds bounded plaintext sections loaded only by search. Heading extraction must match the MDX `rehype-slug` config in `vite.config.ts`, including its `spy-` prefix and per-file GitHub slugger state.

Wrapper pages combine their own metadata with imported repository documents. `updatedAt` is the newest of the frontmatter `updatedAt` stamp and the commit dates of the wrapper and imported bodies, so a stamp written by the editor counts only until a later commit overtakes it; filesystem mtime is the fallback for untracked files and repos without usable Git history.

Development builds add `docs-editor.ts`, which lets the pages table rewrite frontmatter and move files under `src/content/docs`. Moving a page changes its parent because the content directory is the hierarchy. The frontmatter watcher rebuilds the virtual indexes and reloads the page after each write. Production builds have no editing endpoint.

`remark-link-repo-paths.ts` links inline repository paths and relative links in imported repository documents to GitHub, validating every target against the repository root first. Content-root documents keep their authored application routes.

`locales-plugin.ts` is separate from the docs pipeline: it builds and serves the merged locale namespaces (`../../locales/README.md`) and sends `i18next-hmr:update` on locale changes so the client reloads resources without a full refresh.
