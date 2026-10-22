---
syncBreaking: false
clientCacheBump: false
---

# Shiki grammars: code highlighting loads only the languages the app highlights

Editor code blocks highlight through `frontend/src/modules/common/blocknote/syntax-highlighter.ts`, which replaces
`@blocknote/code-block`, and the docs code viewer imports its grammar and themes by path. A language added to
`codeBlockConfig.supportedLanguages` now needs one grammar line in `syntax-highlighter.ts`; the typecheck names the
missing language. Editor code blocks use the `github-dark-default` and `github-light-default` themes of the docs.

## What & why

The code viewer imported shiki's full language and theme maps, so every build emitted 276 grammar and theme chunks to
show one grammar and two themes, and `@blocknote/code-block` shipped 44 grammars for the 7 languages `codeBlockConfig`
allows. The build now emits nine `grammars-*` chunks, one per grammar or theme, and the service worker precaches them.
Both highlighters run precompiled grammars on `@shikijs/engine-javascript/raw`.

## Blast radius

Not sync-breaking: the package sync adds the four `@shikijs/*` dependencies and drops `@blocknote/code-block` and
`shiki` unless app code imports them. Apps with the stock `codeBlockConfig` change nothing. Code-block token colours
shift slightly. No database, API or cache change.

## Run

No script: manual.

## Manual steps

1. A language the app added to `codeBlockConfig.supportedLanguages` gets its grammar in `languages` in `frontend/src/modules/common/blocknote/syntax-highlighter.ts` (`() => import('@shikijs/langs-precompiled/<id>')`) and a sample in `frontend/src/modules/common/blocknote/stories/code-blocks.stories.tsx`.
2. App code importing `syntaxHighlighter` from `@blocknote/code-block` imports it from `~/modules/common/blocknote/syntax-highlighter`.
3. Run `pnpm install`.

## Verify

```sh
pnpm install
pnpm test:storybook
pnpm build
pnpm check
```
