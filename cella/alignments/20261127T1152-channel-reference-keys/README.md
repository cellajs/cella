---
breaking: true
clientCacheBump: false
caughtBy: compiler
generate: true
roots: backend/src
---

# A channel reference carries the tenant in its key

`channelRelationIndexes` is `channelRelationConstraints`: beside the indexes it returns a composite `(tenant_id,
<channel>_id)` key to the channel's `(tenant_id, id)` per ancestor column, cascading with the channel, and a channel table
below the organization spreads it too. `channelRelationColumns` and `membershipChannelColumns` drop their `.references()`,
and `membershipChannelForeignKeys` keys the membership and LTI tables. Rename with the codemod, move a channel's own
ancestor references to the spread, count cross-tenant rows, then run `pnpm generate`.

## What & why

A product's ancestor ids, a channel's own ancestor ids and the membership channel columns referenced their channel by
`id` alone: nothing in the database stopped a row of one tenant from naming a channel of another. Each key now carries
the tenant, and the `unique(tenant_id, id)` every channel table declares is its target. Related channels keep their
id-only `set null` reference: drizzle cannot null one column of a composite key.

## Blast radius

Every app with a channel below the organization: `pnpm generate` swaps one key per such column, and a row that already
names another tenant's channel fails the migration. An app whose only channel is the organization gets an empty diff. No
wire, lens or `clientCacheVersion` change.

## Run

```sh
pnpm cella align run 20261127T1152-channel-reference-keys                         # report only
pnpm cella align run 20261127T1152-channel-reference-keys -- rewrite backend/src   # apply
```

## Manual steps

1. In each channel table below the organization, drop the `.references()` and the `<table>_<channel>_id_index` index of every ancestor id column, and add `...channelRelationConstraints('<table>', table, '<channel>')` to its constraint list. The report's `judge` lines name them; in projectcampus they are `course_sections.course_id`, `projects.course_id` and `projects.course_section_id`.
2. On a database with live rows, run `cross-tenant-counts.sql` as `admin_role` over every pair the app has (raak's full query is the worked example), and repair each row a keyed count finds before step 3.
3. Run `pnpm generate`. Per column it drops the id-only key and adds `<table>_tenant_id_<channel>_id_<channel>s_tenant_id_id_fkey`, hashed above 63 characters. drizzle-kit asks whether each new key is created or renamed: answer create. Off a terminal, pass a create hint per new key; drizzle-kit names the ones it misses. No hand-written SQL.
4. Check each `DROP CONSTRAINT` name in the generated migration against the database: a key renamed by hand-written SQL keeps its old name in drizzle's snapshots. raak's `invitations` keys are dropped as `inactive_memberships_<channel>_id_<channel>s_id_fkey`; the database calls them `invitations_<channel>_id_<channel>s_id_fkey`.

raak's hints for step 3, as drizzle-kit asked for them (`pnpm generate --hints '<array>'`, beside the tenant policy's):

```json
[
  { "type": "create", "kind": "foreign key", "entity": ["public", "tasks", "tasks_tenant_id_project_id_projects_tenant_id_id_fkey"] },
  { "type": "create", "kind": "foreign key", "entity": ["public", "labels", "labels_tenant_id_project_id_projects_tenant_id_id_fkey"] },
  { "type": "create", "kind": "foreign key", "entity": ["public", "attachments", "attachments_tenant_id_project_id_projects_tenant_id_id_fkey"] },
  { "type": "create", "kind": "foreign key", "entity": ["public", "memberships", "memberships_tenant_id_workspace_id_workspaces_tenant_id_id_fkey"] },
  { "type": "create", "kind": "foreign key", "entity": ["public", "memberships", "memberships_tenant_id_project_id_projects_tenant_id_id_fkey"] },
  { "type": "create", "kind": "foreign key", "entity": ["public", "invitations", "invitations_tenant_id_workspace_id_workspaces_tenant_id_id_fkey"] },
  { "type": "create", "kind": "foreign key", "entity": ["public", "invitations", "invitations_tenant_id_project_id_projects_tenant_id_id_fkey"] },
  { "type": "create", "kind": "foreign key", "entity": ["public", "lti_resource_links", "lti_resource_links_v5n0iE7KQTVN_fkey"] },
  { "type": "create", "kind": "foreign key", "entity": ["public", "lti_resource_links", "lti_resource_links_z40FYWM450Ib_fkey"] },
  { "type": "create", "kind": "foreign key", "entity": ["public", "lti_contexts", "lti_contexts_89OOitcUmQxZ_fkey"] },
  { "type": "create", "kind": "foreign key", "entity": ["public", "lti_contexts", "lti_contexts_tenant_id_project_id_projects_tenant_id_id_fkey"] }
]
```

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm test       # schema-verification and rls-security cover each channel reference column
pnpm check
```
