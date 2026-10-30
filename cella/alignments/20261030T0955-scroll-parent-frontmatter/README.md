---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: extraOffset, getScrollParent, viewportTopOf, remark-mdx-frontmatter, api_docs, placeholder.select_role
---

# Scroll parent helpers move, frontmatter leaves Markdown modules

`getScrollParent` and `viewportTopOf` move from `common/sticky-box` to `~/utils/scroll-parent`, `AsideAnchor` loses `extraOffset`, a compiled `.md` or `.mdx` module no longer exports `frontmatter`, and the common keys `api_docs` and `placeholder.select_role` are gone.

## What & why

Four scroll-parent lookups disagreed on what counts as a scroller, so one helper replaces them. A scroll-spy section now rests at its CSS scroll margin, one `[id^="spy-"]` rule, and every `AsideAnchor` takes the taller offset. Docs metadata reaches pages through `virtual:docs-frontmatter`, which left the `remark-mdx-frontmatter` export with no reader.

## Blast radius

Typecheck names each import, prop and key. An app that scrolls its own sections with `**:[[id^=spy-]]:scroll-mt-*` or relies on the 32px `AsideAnchor` offset sees a section rest at another height; no error reports that. No lens and no database change.

## Run

No script: manual.

## Manual steps

1. Import `getScrollParent` and `viewportTopOf` from `~/utils/scroll-parent`.
2. Drop `extraOffset` from `AsideAnchor`, and drop a `scroll-mt-4` on spy sections that the new base rule covers.
3. Read page metadata from `virtual:docs-frontmatter`, and remove `remark-mdx-frontmatter` if the app added it to its own build.
4. Replace `c:api_docs` with `c:docs`, and give a `ResponsiveSelect` that used `c:placeholder.select_role` a `title` or its own `placeholder`.

## Verify

```sh
pnpm check
```
