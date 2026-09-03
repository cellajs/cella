# Comment budget: delete comments that restate their own code

## What & why

`shared/scripts/check-frontend-style.ts` loses the `export-description` rule (a JSDoc on every
exported function and `const`); `cella/AGENTS.md` § Style & naming gains a **Comment budget**.
`trim-comment-budget.ts` deletes the docs the old rule bred under two rules: **name-restating** (at
least 60% of the doc's content words appear in the identifier) and **boilerplate** (a curated
template phrase of at most 8 words). Member docs are judged only when the identifier itself
carries the words. Report-only, off by default: **near-empty** (docs of three words or fewer on
members whose type is already named, exempting banners and docs stating a default or condition)
and **duplicate** (identical short docs across three or more files; hoisting candidates only).
Never touched: tool directives
(`biome-ignore`, `ts-expect-error`, `v8 ignore`, `@vite-ignore`, `#__PURE__`), JSDoc with an
`@tag`, `TODO`/`FIXME`/`HACK`, cella `fork:` markers, license headers, `.stories.` files,
generated trees (`sdk/gen`, `backend/drizzle`, `locales`, `*.gen.*`, `routeTree.gen`).

## Blast radius

Comments only: not sync-breaking, no `clientCacheVersion` bump, no lens, no DB. Skipping costs
comment-only conflicts in shared files on the next sync. Apps with a customized
`check-frontend-style.ts` must confirm `export-description` is gone before running the codemod, or
the gate keeps reporting violations it can no longer satisfy.

## Run

```sh
# report only, all rules
pnpm exec tsx cella/migrations/20260817T2052-comment-budget/trim-comment-budget.ts inventory \
  frontend/src backend/src shared --rules name,boilerplate,duplicate --verbose

# apply the two safe rules
pnpm exec tsx cella/migrations/20260817T2052-comment-budget/trim-comment-budget.ts rewrite \
  frontend/src backend/src backend/tests backend/emails shared cdc/src yjs/src mcp/src \
  sdk/src bench/src infra packages frontend/storybook frontend/vite
```

Add your own product-module roots. Flags: `--name-ratio 0.6` (raise toward
0.8 to delete less), `--max-lines 2` (longer docs are never judged), `--dup-threshold 3`, `--rules`,
`--verbose`.

## Manual steps

1. Review the diff: a doc whose only information is a qualifier the identifier omits
   (`soft`-delete, `client`-provided) is protected by a non-exhaustive word list; restore what you
   needed.
2. `pnpm comments:placement` lists detached long comments; trim them by hand.
3. Run the report-only `duplicate` inventory and hoist each surviving copied note to its shared
   abstraction, deleting the copies.

## Verify

```sh
pnpm lint:fix        # the codemod leaves the removed line's blank space for Biome to close
pnpm frontend:style  # export-description must be gone; component-declaration is unrelated
pnpm comments:check
pnpm check
```
