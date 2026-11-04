---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: useSortedClasses, noComponentHookFactories
---

# Biome 2.6

Biome is 2.6.4. `pnpm lint:fix` rewrites the Tailwind class order of app-owned files to the 2.6 sort. `noComponentHookFactories` now flags a component or hook defined inside another function in app source; tests are exempt. An app that sets its own `biome.jsonc` renames `useSortedClasses` and moves its options to the top-level `tailwind` block.

## What & why

`@biomejs/biome` moves from 2.5.15 to 2.6.4. The class sort rule is `nursery/useTailwindSortedClasses`, its attributes and functions live in `tailwind`, and the 2.6 sort orders some classes differently. Markdown and YAML formatting stays off. `.claude` is force-ignored so `pnpm sdk` does not index agent worktrees.

## Blast radius

Every app: a class-order rewrite of app-owned files and any component factory in app source (raak and projectcampus have none beyond template files). No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm install`, then `pnpm lint:fix`, and commit the rewrite on its own.
2. For each `noComponentHookFactories` finding, move the component to module scope and read what it closed over from props or context; a factory that runs once at module import takes a `biome-ignore` with that reason.
3. Never run `biome migrate --write` from a checkout with worktrees under it: it rewrites every nested `biome.jsonc`.

## Verify

```sh
pnpm check
```
