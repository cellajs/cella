# Entity -> product/channel rename migration

Sharpens loosely-named `entity` identifiers to say what they actually are. Cella has two entity families: **channel entities** (`channelEntityTypes`, membership-scoped, e.g. `organization`) and **product entities** (`productEntityTypes`, content, e.g. `attachment`). Much engine code is intentionally entity-agnostic and stays generic. This migration only touches identifiers that were constrained to one family but wore the generic word `entity`:

- **product-only**: embeddings, seen/unseen tracking, the product cache middleware, the product-sync SSE notification, CDC product sequence stamps.
- **channel-only**: membership/permission/ancestor enrichment, channel counts, the channel route config, the channel grid tile, the leave-channel button.

Upstream cella arrives already migrated; this runs the same sweep on fork-specific code so a `cella-cli pull` sees identical renames on both sides and conflicts stay minimal.

## What the codemod changes

`entity-to-product-channel.ts` rewrites an explicit **old -> new allow-list** of whole identifiers (word-boundary matched; the `RENAMES` map in the script) plus the kebab stems of renamed files inside import paths (`FILE_STEMS`).

It deliberately does **not** touch the ambiguous generic tokens that mean different things in different places: `entityType`, `entityTypes`, `entityId`, `entityIds`, `entityKey`, the bare `'entity'` string literal, and the `entity_id`/`entity_type` DB columns. Those are handled by the manual steps below. Add fork-specific channel/product identifiers via `--extra-renames <file>` (a fork-owned JSON object `{ "oldName": "newName" }`, merged into the allow-list for the run), never by editing the script, which would conflict on the next sync.

## Run it

On fork-specific code after pulling the upstream sweep:

```sh
# from the repo root
pnpm exec tsx cella/migrations/2026-07-entity-product-channel/entity-to-product-channel.ts inventory frontend/src backend/src shared cdc/src   # report only
pnpm exec tsx cella/migrations/2026-07-entity-product-channel/entity-to-product-channel.ts rewrite  frontend/src backend/src shared cdc/src   # apply

# with fork-specific renames (fork-renames.json: { "EntityFooWidget": "ChannelFooWidget" })
pnpm exec tsx cella/migrations/2026-07-entity-product-channel/entity-to-product-channel.ts rewrite frontend/src backend/src shared cdc/src --extra-renames fork-renames.json
```

Then, by hand:

1. **Rename files** (the codemod already rewrote the import paths that point at them, so do these with `git mv`):

   | old | new |
   | --- | --- |
   | `backend/src/middlewares/entity-cache/` (directory) | `backend/src/middlewares/product-cache/` |
   | `backend/src/middlewares/entity-cache/app-entity-cache.ts` | `…/product-cache/app-product-cache.ts` |
   | `frontend/src/hooks/use-page-entity-key.ts` | `…/use-page-channel-entity-key.ts` |
   | `frontend/src/modules/memberships/leave-entity-button.tsx` | `…/leave-channel-entity-button.tsx` |

   Fork-added product-cache / page-entity-key / leave-button files follow the same stem pattern.

2. **Ambiguous field/param/literal renames the codemod skips** — apply per-file in your fork wherever it forked these surfaces:

   - **Seen store/mark/sync** (`frontend/src/modules/seen/`): the `SeenBatch`/`SeenMeta` fields and the `markProductSeen` / `applyUnseenDelta` / `ingestSyncedRows` params `entityType`->`productType`, `entityId`->`productId`, `entityIds`->`productIds`.
   - **Seen queries** (`backend/src/modules/seen/`): the `findUnseenCountsByUser` options field `entityTypes`->`productTypes` and the returned row field `entityType`->`productType`.
   - **Product-sync notification wire**: in `stream-schemas.ts` / `build-message.ts` / `stream-mocks.ts` and their consumers, the `StreamNotification` `kind` literal `'entity'`->`'product'` and its `entityType` field ->`productType`. Update every `kind === 'entity'` / `notification.entityType` reader.
   - **`product_counters` columns** (`product-counters-db.ts`): drizzle fields `entityId`->`productId`, `entityType`->`productType` (db columns `entity_id`/`entity_type`->`product_id`/`product_type`). Update the `productCountersTable.entityId`/`.entityType` query refs and the raw `INSERT INTO product_counters (...)` / `ON CONFLICT (...)` SQL in `recalculate-counters.ts` and `seen/operations/mark-seen.ts`. Leave the generic `entity_type` discriminator column that every entity row/table carries.
   - **Membership mutation fields** (`memberships/types.ts` + `query-mutations.ts` + `menu-sheet/item-edit.tsx`): on `MembershipChannelProp` / `MutationUpdateMembership`, `entityType`->`channelType`, `entityId`->`channelId`. Keep the SDK `similarMembers({ entityId, entityType })` query-key param names (map at that boundary).

3. **DB migration** — the `seen_by` and `product_counters` columns are renamed:

   ```sql
   ALTER TABLE seen_by RENAME COLUMN entity_id TO product_id;
   ALTER TABLE seen_by RENAME COLUMN entity_type TO product_type;
   ALTER INDEX seen_by_user_entity_index RENAME TO seen_by_user_product_index;
   ALTER INDEX seen_by_entity_id_index RENAME TO seen_by_product_id_index;

   ALTER TABLE product_counters RENAME COLUMN entity_id TO product_id;
   ALTER TABLE product_counters RENAME COLUMN entity_type TO product_type;
   ```

   Upstream ships this as a generated drizzle migration. After pulling, run `pnpm generate` (answer "rename" for each column when drizzle prompts), then `pnpm migrate`. The generic `entity_type` discriminator column on every entity row/table is a different thing and stays.

4. **Config keys** — `appConfig.entityEmbeddings`->`productEmbeddings` (fields `embeddedEntity`/`hostEntity`->`embeddedProduct`/`hostProduct`) and `seenTrackedEntityTypes`->`seenTrackedProductTypes` are renamed by the codemod inside your `config.*.ts` overrides. Double-check your fork's config files were in the scanned roots.

5. **Regenerate the SDK**: `pnpm sdk` (the notification `kind` enum and seen schemas changed), then run the repo gates: `pnpm check`.
