# Comment budget: delete comments that restate their own code

## What & why

Two changes, one cause.

`shared/scripts/check-frontend-style.ts` required a JSDoc description on every exported function
and every exported `const` (rule `export-description`). Mandating documentation by position rather
than by content is how a codebase acquires hundreds of docs that restate their own identifier:
`/** Renders the styled sheet primitive. */` on `Sheet`, `/** Mutation hook for creating a new
attachment. */` on `useAttachmentCreateMutation`, `/** Attachment query keys. */` on
`attachmentQueryKeys`. Agents
satisfy the rule the cheapest way available, which is to paraphrase the name. That rule is now
removed, and `cella/AGENTS.md` § Style & naming gains a **Comment budget** governing which
comments earn their place: members, locals, JSX, and a no-repeats rule for modules cloned from a
sibling.

`trim-comment-budget.ts` then deletes the docs the old rule produced. It judges only comments whose
entire content is recoverable from the identifier beside them, under two rules:

- **name-restating**: at least 60% of the doc's content words already appear in the identifier
  ("Find all passkey credential IDs for a user." on `findCredentialIdsByUser`).
- **boilerplate**: the doc matches a curated template phrase and is at most 8 words
  ("Renders the X component.", "Query options for …", "--- Mutations ---" banners).

Member docs follow the opposite rule from function docs, and the codemod is built around that. A
function's signature and body reveal its behavior, so a doc repeating them is noise. A member typed
`string`, `number`, `boolean`, `unknown`, or `any` reveals nothing, so its doc is often the only
specification it has: across this repo half of all documented members have such a type, and
sampling the rest turns up wire formats, null conditions, and population sources rather than
filler. Both rules above therefore leave a member doc alone unless the identifier itself already
carries the words.

Two further rules are **report-only and off by default**, because both need a human.

**near-empty** finds three-word-or-shorter docs on members whose type is already named ("State
tracking" on `_state: WebSocketState`), exempting section banners and any doc that states a default
or a condition. It found 11 candidates here and roughly a third still carried a fact the member
needed, such as a `key -> value` shape or a state qualifier. Read the inventory, apply by hand.

**duplicate** It finds identical short docs
repeated across three or more files, which is how a cloned module inherits its sibling's comments.
It cannot tell a copied note from the same local pattern genuinely recurring: every product
module's `query.ts` really does exclude `include` from its own cache key, and deleting all copies
of that note loses it. Read its inventory as a list of hoisting candidates and move each by hand.

Never touched: tool directives (`biome-ignore`, `ts-expect-error`, `v8 ignore`, `@vite-ignore`,
`#__PURE__`), any JSDoc carrying an `@tag`, `TODO`/`FIXME`/`HACK`, cella `fork:` sync markers,
license headers, `.stories.` files (Storybook publishes those docs as story descriptions), and
generated trees (`sdk/gen`, `backend/drizzle`, `locales`, `*.gen.*`, `routeTree.gen`).

## Blast radius

Comments only: no identifier, signature, type, or runtime behavior changes, so this is not
sync-breaking, bumps no `clientCacheVersion`, ships no lens, and does not touch the database. An
app can skip it entirely and stay correct; the cost of skipping is that its `export-description`
docs stay while the template's are gone, so the next sync shows comment-only conflicts in shared
files.

Apps carrying their own `check-frontend-style.ts` customization should confirm the
`export-description` rule is gone before running the codemod, or the sweep will leave the gate
reporting violations it can no longer satisfy.

## Run

```sh
# Report only, all rules including the report-only duplicate scan.
pnpm exec tsx cella/migrations/20260817T2052-comment-budget/trim-comment-budget.ts inventory \
  frontend/src backend/src shared --rules name,boilerplate,duplicate --verbose

# Apply the two safe rules.
pnpm exec tsx cella/migrations/20260817T2052-comment-budget/trim-comment-budget.ts rewrite \
  frontend/src backend/src backend/tests backend/emails shared cdc/src yjs/src mcp/src \
  sdk/src bench/src infra packages frontend/storybook frontend/vite
```

Apps should add their own product-module roots to that list. The rules are name-based, not
entity-name-based, so no per-app configuration is needed.

Tuning flags: `--name-ratio 0.6` (raise toward 0.8 to delete less), `--max-lines 2` (docs longer
than this are never judged), `--dup-threshold 3`, `--rules`, `--verbose`.

## Manual steps

1. Review the diff before committing. The codemod is deliberately conservative, but a doc whose
   only information is a qualifier the identifier omits (`soft`-delete, `client`-provided) is
   protected by a word list that cannot be exhaustive. Restore anything it took that you needed.
2. Trimming an over-long comment down to the budget is a human edit and is out of scope here. Run
   `pnpm comments:placement` for the detached long-comment list and work through it by hand.
3. Run the report-only `duplicate` inventory and hoist each surviving copied note to the shared
   abstraction it belongs to, deleting the copies.

## Verify

```sh
pnpm lint:fix        # the codemod leaves the removed line's blank space for Biome to close
pnpm frontend:style  # export-description must be gone; component-declaration is unrelated
pnpm comments:check
pnpm check
```
