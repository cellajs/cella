# Frontend Vite plugins

The frontend Vite configuration treats documentation as content rather than application source. Markdown and MDX files under `src/content/docs` become lazy React page chunks. Thin MDX pages may also import repository documents so canonical engineering documentation can appear in the application without copying it.

`docs-frontmatter.ts` builds two virtual modules without importing page components. `virtual:docs-frontmatter` contains page metadata and headings for navigation, while `virtual:docs-search-sections` contains bounded plaintext sections loaded only by search. Heading extraction must match the MDX `rehype-slug` configuration in `vite.config.ts`, including its `spy-` prefix and per-file GitHub slugger state.

Wrapper pages combine their own metadata with imported repository documents. Their `updatedAt` value is the newest commit date across the wrapper and imported bodies, unless frontmatter pins a date. A filesystem modification time is the fallback for untracked files and repositories without usable Git history.

Development builds add `docs-editor.ts`, which lets the pages table rewrite frontmatter and move files under `src/content/docs`. Moving a page changes its parent because the content directory is the hierarchy. The frontmatter watcher rebuilds the virtual indexes and reloads the page after each write. Production builds contain no editing endpoint.

`remark-link-repo-paths.ts` links inline repository paths and relative links in imported repository documents to GitHub. It validates every target against the repository root before emitting a link. Content-root documents keep their authored application routes.

`locales-hmr.ts` is separate from the docs pipeline. It mirrors locale assets into the configured cache, merges namespaces, and sends `i18next-hmr:update` so the client can reload resources without a full page refresh.
