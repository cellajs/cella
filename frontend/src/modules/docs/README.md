# Documentation module

Documentation pages live in `frontend/src/content/docs` as Markdown or MDX. The path relative to that directory is the slug; an `index` file represents its directory and is the parent of nested pages. The root `index.mdx` supplies landing-page and sidebar configuration, not a regular page.

`modules/page/content.ts` validates the `virtual:docs-frontmatter` metadata and builds the page tree; pipeline: [frontend/vite/README.md](../../../vite/README.md).

Search is lazy at two levels: the dialog shell loads with the docs UI, while Orama and `virtual:docs-search-sections` load on the first search. The browser builds the small index from raw documents; API operation and schema records come from the same React Query cache as the API reference, so search degrades to page-only results when the API corpus is unavailable and adds it later.
