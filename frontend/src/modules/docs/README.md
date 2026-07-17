# Documentation module

Documentation pages live in `frontend/src/content/docs` as Markdown or MDX. Their path relative to that directory is their slug; an `index` file represents its directory, and the directory's index page is the parent of nested pages. The root `index.mdx` supplies global landing-page and sidebar configuration rather than a regular page.

The build pipeline in `frontend/vite` exposes page metadata through `virtual:docs-frontmatter` and keeps each page body in a lazy component chunk. `modules/page/content.ts` validates that metadata and builds the page tree. See [`frontend/vite/README.md`](../../../vite/README.md) for the virtual modules, imported repository documents, edit endpoint, and Git-derived dates.

Search is lazy at two levels. The dialog shell loads with the docs UI, while Orama and `virtual:docs-search-sections` load on the first search. The browser builds the small index from raw documents; API operation and schema records come from the same React Query cache as the API reference. Search can therefore degrade to page-only results when the API corpus is unavailable and add it later.
