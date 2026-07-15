# ChannelEntity rename migration

Renames the **channel entity** concept (membership-scoped entities that host
products — `organization`, `project`, …) to **channel entity**, unifying
vocabulary with the sync engine's stream channels (routing keys like `org:abc`
are already root channel-entity ids). Upstream cella arrives already migrated;
this runs the same sweep on fork-specific code so a `cella-cli pull` sees
identical renames on both sides and conflicts stay minimal.

## What it changes

`context-to-channel.ts` rewrites an explicit **allow-list** of identifiers
(word-boundary matched, case preserving — `ContextEntityType→ChannelEntityType`,
`contextType→channelType`, `context_counters→channel_counters`, …), the
`'context'` entity-kind / OpenAPI-tag string literal, the `.context()`
builder/contract method → `.channel()`, and the kebab stems of renamed files in
import paths.

It deliberately does **not** touch unrelated "context": `AuthContext`,
`DbContext`, trace/span context, tenant context, Hono request `Context` /
`ContextVariableMap`, `ContextMenu`, React `createContext`/`useContext`, canvas
`getContext`, MCP. (The full allow-list is the `IDENTIFIERS` array in the
script — add fork-specific channel-entity identifiers there before running.)

## Run it

On fork-specific code after pulling the upstream sweep:

```sh
# from the repo root
pnpm exec tsx cella/migrations/2026-07-channel-entity-rename/context-to-channel.ts inventory frontend/src backend/src   # report only
pnpm exec tsx cella/migrations/2026-07-channel-entity-rename/context-to-channel.ts rewrite  frontend/src backend/src   # apply
```

Then, by hand:

1. **Rename files** (the codemod already rewrote the import paths that point at
   them, so do these with `git mv`):

   | old | new |
   |---|---|
   | `shared/src/config-builder/resolve-row-context.ts` | `…/resolve-row-channel.ts` |
   | `shared/src/config-builder/tests/resolve-row-context.test.ts` | `…/resolve-row-channel.test.ts` |
   | `cdc/src/utils/context-columns.ts` | `…/channel-columns.ts` |
   | `backend/src/modules/entities/helpers/collect-sub-context-ids.ts` | `…/collect-sub-channel-ids.ts` |
   | `backend/src/modules/entities/context-counters-db.ts` | `…/channel-counters-db.ts` |
   | `backend/src/permissions/get-context-entity.ts` | `…/get-channel-entity.ts` |
   | `backend/src/schemas/context-entity-included.ts` | `…/channel-entity-included.ts` |
   | `backend/src/mocks/mock-context-entity-id-columns.ts` | `…/mock-channel-entity-id-columns.ts` |
   | `backend/src/db/utils/context-relation-columns.ts` | `…/channel-relation-columns.ts` |
   | `backend/src/db/utils/context-relation-schema.ts` | `…/channel-relation-schema.ts` |
   | `backend/src/db/utils/context-entity-columns.ts` | `…/channel-entity-columns.ts` |
   | `frontend/src/utils/context-entity-route.ts` | `…/channel-entity-route.ts` |
   | `frontend/src/modules/navigation/menu-sheet/helpers/collect-context-ids.ts` | `…/collect-channel-ids.ts` |

   Fork-added `*context*` files follow the same pattern.

2. **i18n keys** — the codemod skips JSON: rename `features.context_entities` /
   `entity_buckets.context_entities` → `channel_entities` in your locales (and
   any fork keys), updating the display copy too.

3. **Docs / prose** — the codemod only touches identifiers; sweep "context
   entity" → "channel entity" prose in your own docs.

4. **Regenerate the SDK**: `pnpm sdk`.

5. **DB migration** — the schema *sources* now emit `channel_*` (columns
   `context_type/context_id → channel_type/channel_id`, table
   `context_counters → channel_counters`, `context_key → channel_key`, indexes +
   constraints, plus the RLS / immutability / counter-function / unlogged SQL).
   Run `pnpm generate` and answer **"rename"** to the drizzle-kit
   column/table/index prompts (renames, not drop+create — the stored values are
   entity-type names, so no row rewrite), then apply (`pnpm migrate`, or
   `pnpm db:reset` for a dev DB). Postgres `RENAME` follows object OIDs, so
   policies/triggers survive; function bodies that name the tables in text are
   re-emitted by the same `pnpm generate`.

## Gates

```sh
pnpm exec biome check --write .
pnpm ts
```

Backend integration tests fail until the DB migration is applied (they insert
`channel_type` into a DB whose schema still has `context_type`). The codemod is
idempotent: `inventory` on already-migrated code reports zero changes.
