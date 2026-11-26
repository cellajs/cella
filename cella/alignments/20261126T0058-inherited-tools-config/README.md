---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: toolsConfig[, toolsConfig?.[
---

# A channel arranges the pages of the channels below it

Every app channel schema takes `channelToolsConfigSchema('<type>')` for its `toolsConfig`, and every response builder
of a channel below the organization fills `included.inheritedToolsConfig` from `getInheritedToolsConfigs`. Frontend
reads of an arrangement go through `channelSlotConfig(row, slot)`, server rules through `getStackedSlotConfig`.
`TabsArrangementCard` takes a `slot` in place of `parentRouteId`, and its `onPersist` returns the write's promise.

## What & why

A channel row's `toolsConfig` may hold the slots of the channel types below it: an organization can hide a tab on
every project. Per slot the layers stack from `surfaces` through each ancestor to the row: hidden ids add up, and the
narrowest order leads. The server sends the ancestors' layers in `included.inheritedToolsConfig`, because a reader may
read none of those channels. `toolsConfigSchema`, `channelSlots()` and `invalidateArchivedChannel` are gone.

## Blast radius

Breaking for an app with a channel below the organization: its schemas and response builders stop compiling. An app
whose only channel is the organization fixes the sites the compiler names, and nothing else changes for it. No migration, lens or
`clientCacheVersion` bump: every reader treats the new field as possibly absent.

## Run

No script: manual.

## Manual steps

Each step says whether the compiler finds its sites; the others take the `grep` list.

1. Caught by the compiler. In each app channel schema, replace `toolsConfigSchema` with `channelToolsConfigSchema('<type>')`, in the response schema and in the update body's `mergePatchSchema(...)`. The keys narrow to the row's storable slots (`storableSlots`): its own and those of the channel types below it.
2. Caught by the compiler for reads, lists and updates, not for a batch create, whose `batchResponseSchema` types its results loosely. Every operation that answers with a channel below the organization fills `included.inheritedToolsConfig` with `(await getInheritedToolsConfigs(ctx, '<type>', rows)).get(row.id)`, one call for a list's rows together; fill each create by hand. The organization `orgGuard` resolved costs no query, and the other ancestors cost one statement per call, the organizations of a list across organizations among them. Mocks, OpenAPI examples and rows the frontend builds, such as demo data, add `inheritedToolsConfig: {}`.
3. Caught by the compiler. Where app code renders `TabsArrangementCard`, drop `parentRouteId`: the card finds the layout route from `slot`, its own type's `.tabs` slot by default. Make `onPersist` return the write's promise, such as `mutateAsync`. A card on a channel other than the organization needs `toolsConfig` in that channel's update body and a merge of it in its update operation, as `updateOrganization` does.
4. Caught by the compiler. `invalidateArchivedChannel` is `invalidateChannelsInside` in `~/query/realtime/membership-ops`, and `channelSlots()` is `storableSlots('organization')`.
5. Not caught by the compiler. Where a route's `beforeLoad` passes `slotConfig: row.toolsConfig['<type>.tabs']` to `guardNavTabs`, or app frontend code reads `toolsConfig[` or `toolsConfig?.[` otherwise, pass `channelSlotConfig(row, '<type>.tabs')`. A server rule that reads an arrangement, such as a create refused while its tab is hidden, reads `getStackedSlotConfig(ctx, '<type>', row, slot)`. The `grep` finds a helper that takes a row's whole `toolsConfig` and reads a slot of it, but not the rules that call it: follow it to each caller.
6. Not caught by the compiler. The wire took any channel's slot on any row, so an API client or a seed may have stored another type's key. Per channel table, list the keys outside the row's own slots: `SELECT id, key FROM projects, jsonb_object_keys(tools_config) AS key WHERE key NOT IN ('project.settings', 'project.tabs');`, the table and type of each in turn. A key of a type below the row now applies to every row inside it: keep it only where that arrangement is meant. A key of a type above or beside it applies nowhere and the wire refuses it: drop it with `UPDATE projects SET tools_config = tools_config - 'course.tabs' WHERE tools_config ? 'course.tabs';`.
7. Not caught by the compiler. Where the app ships a language of its own, translate the new texts `resource_tabs`, `resource_tabs.text` and `hidden_above.text`.

## Verify

```sh
pnpm sdk
pnpm --filter backend exec vitest run src/schemas/tools-config.test.ts src/modules/entities/inherited-tools-config.test.ts
pnpm check
```
