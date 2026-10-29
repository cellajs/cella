# Permissions

This document explains Cella's contextual RBAC: how the answer to **may this actor perform this action on this subject?** is computed, everywhere that question is asked.

### TL;DR

**You present an access, the policy is consulted, a permission is returned.** The permission
engine combines the user's memberships, the configured rules for their roles, and values on the
row. Roles are assigned on containers such as organizations, and content inside uses those roles.
Creator-only rules compare the user with the row's `createdBy` value.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Permission decision flow                           │
├──────────────────────────────────────────────────────────────────────────────┤
│  Config, validated once at boot                                              │
│  ┌───────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ hierarchy-config.ts           │  │ permissions-config.ts               │  │
│  │   kinds, ancestor chains,     │  │   policy matrix: entity × channel   │  │
│  │   roles, elevated roles       │  │   × role → 0 | 1 | 'own'            │  │
│  │                               │  │   public read per entity type       │  │
│  └──────────────┬────────────────┘  └────────────────┬────────────────────┘  │
│                 │                                    │                       │
│                 └────────────────┬───────────────────┘                       │
│                                  ▼                                           │
│      ┌──────────────────────────────────────────────────────────┐            │
│      │      Permission engine: shared/, tier-neutral, ORM-free  │            │
│      │                                                          │            │
│      │  1. order channels   most-specific → organization        │            │
│      │  2. system admin?    allow every action, short-circuit   │            │
│      │  3. memberships      policy cell per (channelType, role) │            │
│      │       1           → grant                                │            │
│      │       condition   → grant iff the row matches            │            │
│      │       0           → nothing                              │            │
│      │  4. public read      widens `read` only                  │            │
│      │  5. emit `can` + why each action was granted             │            │
│      └───┬───────────┬────────────────┬────────────────┬────────┘            │
│          │           │                │                │                     │
│   ┌──────▼─────┐ ┌───▼──────────┐ ┌───▼───────────┐ ┌──▼─────────────┐       │
│   │ Backend    │ │ SSE dispatch │ │ Yjs relay     │ │ Frontend       │       │
│   │ routes     │ │              │ │               │ │                │       │
│   │ single row │ │ per change,  │ │ WS upgrade,   │ │ `can` map      │       │
│   │ + compiled │ │ every        │ │ no backend    │ │ drives UI      │       │
│   │ SQL for    │ │ subscriber   │ │ round-trip    │ │ controls       │       │
│   │ list reads │ │ at once      │ │               │ │ (never trusted)│       │
│   └────────────┘ └──────────────┘ └───────────────┘ └────────────────┘       │
└──────────────────────────────────────────────────────────────────────────────┘
```

The engine **never loads rows**. Callers hand in the row data a decision needs. The two config files change together. Tenant isolation in the database is a separate layer: [Multi-tenancy](./MULTI_TENANCY.md).

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Channel** | Owns roles and memberships. `organization` is the fixed spine every channel nests under. |
| **Product** | Owns no roles and inherits from the channels above it (`attachment`). Must have a channel parent. |
| **Home** | A product row's deepest non-null channel ancestor: the channel the row lives in. |
| **Membership** | A user's role on one channel. |
| **Actor** | Who acts: a user or a service account. |
| **Binding** | A role on a channel, whoever holds it: a membership for a user, a stored binding for a service account. |
| **Subject** | What is acted on: entity type, optional id, its ancestor channel ids, optionally the row. |
| **Policy cell** | `0` (deny), `1` (allow), or a row-condition name (`'own'`: allow on qualifying rows). |
| **Action** | `create`, `read`, `update`, `delete`. |
| **Grant source** | Why an action was allowed: `membership`, `relation`, `public`, or `systemAdmin`. |
| **Access scope** | The mask an API key or access token puts over its actor's bindings. |

## The access you present

Every check takes an `Access`: the actor with its bindings and scopes, or anonymous. Handlers get it from `accessFrom(ctx)`, never by hand. A session is unmasked; an API key or access token narrows every decision to its scopes. A membership change reaches every check within seconds, whatever wrote it.

## The policy consulted

**`shared/config/hierarchy-config.ts`**, a fluent builder:

```ts
export const roles = createRoleRegistry(["admin", "member"] as const);

export const hierarchy = createEntityHierarchy(roles)
  .user()
  .organization({ roles: roles.all, elevated: ["admin"] })
  .product("attachment", { parent: "organization" })
  .build();
```

**`shared/config/permissions-config.ts`** declares the matrix:

```ts
export const { policyMatrix, publicReadGrants, accessScopes } = configurePermissions(
  appConfig.entityTypes,
  ({ entityType, channels }) => {
    switch (entityType) {
      case "organization":
        channels.organization.admin({ read: 1, update: 1, delete: 1 });
        channels.organization.member({ read: 1, update: 0, delete: 0 });
        break;
      case "attachment":
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 1, read: 1, update: "own", delete: "own" });
        break;
    }
  },
);
```

Omitted actions and missing role/channel rows deny, so policies only declare grants. `'own'` is the built-in owner condition.

Channel entities have two row kinds: **elevation** rows on an ancestor channel say what a parent's member may do to the child (where `create` lives). **Self** rows on the same channel say what the entity's own members may do to it (a self-row `create` is inert). Product entities have only **home** rows, where `create` grants creating inside that channel.

A row's home is the product's declared parent, or a channel above it when the hierarchy lets the parent's id be null (`nullableAncestors`). A role's product grants reach only rows homed at its own channel, unless the hierarchy declares the role `elevated` there: then they reach the channel's whole subtree. No grant reaches rows homed above its channel. Channel subjects are never home-scoped, so a grant above a channel counts in full for it.

## The permission returned

The **`checkAccess*` family** is what every tier calls:

```ts
checkAccess(access, action, subject); // → PermissionResult: the request-path check
checkAccessBatch(access, action, subjects); // → BatchPermissionResult: one actor, many rows (list splitting)
checkAccessFanout(accesses, action, subject, options?); // → PermissionResult[]: many actors, one row (stream fan-out)
```

A subject's ancestor scope is **tri-state**: a channel id, `null` for explicitly not scoped to that ancestor, or `undefined` for a required scope left out, which throws. A missing scope never defaults to unscoped, which would bypass permissions.

## Row conditions

Two mechanisms read the row's own columns. A **row condition** in a policy cell grants only on matching rows, where a `1` grants on every row in channel scope. **Public read** widens `read`, and nothing else, to rows whose `public` flag is set. The set is **closed** to `own` and `public` (`shared/src/permissions/row-conditions.ts`): every rule must be evaluable in JS, compiled SQL, the frontend, and by dispatch from the row alone, so no cross-row or app-defined conditions.

Public read is declared per subject with `publicRead()` and holds for any actor, anonymous included. The flag is row-local: the server copies the home channel's flag onto a new row, and it never cascades.

### Drafts

A row whose `publishedAt` is null is a draft, checked before the engine. A product draft shows to its author alone. A channel starts as a draft only when its hierarchy entry declares `drafts: { prepareRoles }` and the create asks for one. It then shows to its own members and to a grant above it that holds `update` on its type. Its invitations wait for the publish, except those for its `prepareRoles`, which go out at once so those people can set it up.

## Frontend map

The UI reads a `can` map per channel (`entity.can[entityType][action]`), built by `computeCan` from the same policy matrix and the actor's grants on the channel and above it. A cell is `true`, `false` or a condition `resolveCan` checks per row: `'own'` for the creator's rows, `'home'` for rows homed at the map's channel, or both combined. A row control passes the row and the channel; a channel-wide feature asks `isUnconditionalCan`.

A route gate (`requireEntityAction`) asks the same map before the page loads, and lets the page load when it cannot read the memberships (offline with none cached): the server decides. The map shapes the interface only, and a parity test checks it against the engine for every combination of roles.

## Enforcement paths

| Path | Guard or helper | What it checks | On failure |
| --- | --- | --- | --- |
| Guard chain | [Guards](#guards) | Who acts, and whether they are in the tenant and the organization. Never consults the policy matrix. | 401 or 403 before the handler ([Refusals](#refusals)) |
| Single row | `getValidProduct`, `getValidChannel` | Loads the row, checks it is in the request's tenant and organization, runs the engine | 404 for a row the caller may not read, 403 for a denied action on one it reads |
| Create | `canCreateEntity` | No row exists yet. The subject describes the would-be placement | 403 |
| Bulk | `splitByPermission` | The single-row checks for every id | Rejected ids listed; 403 only when nothing is allowed |
| Collection read | `buildCollectionReadWhere` | Compiles readable scope, row conditions, and public read into one SQL predicate. Never loads rows to reject them. | An empty list |
| SSE dispatch | `accessDecisions` | One `checkAccessFanout` per change or signal over the organization's subscribers | No frame. A change sent too wide leaks data because announced rows are fetchable |
| Catchup views | `resolveViewReadStatus` | May the caller see a subtree's frontiers and counts | `opaque` or `forbidden` |

Two rules bind every path: **the system-admin bypass applies to collection reads too** (a system admin passes `orgGuard` with no membership, so scope resolution must not be membership-only), and **any grant the single-row path honours must appear in lists and over SSE**.

Aggregates run no row condition: member counts, newest-post times and organization totals count every live row of the organization, which matches what a viewer may list only while no read cell is row-conditional, so an app that adds an `own` or `public` read cell must scope them itself.

### Guards

Every route lists its guards in `xGuard`, and they run in that order before the handler. The first proves who acts; the next ones check that the actor is in the tenant and the organization the URL names. A guard declares what it reads of an earlier one, so a route that lists them out of order fails when its module loads.

Organization content runs behind `[userGuard, tenantGuard, orgGuard]`, with `actorGuard` in place of `userGuard` where an API key or access token may call too. The user's own account runs behind `[userGuard]` alone.

| Guard | Admits | Refuses with |
| --- | --- | --- |
| `publicGuard` | Anyone, with no actor | Nothing |
| `userGuard` | A session cookie: the signed-in user, or an admin impersonating them | 401 |
| `serviceGuard` | An API key or an access token, masked by its scopes, never a system admin | 401; 403 from a browser origin |
| `tokenGuard` | An access token only, for the MCP face | 401 |
| `actorGuard` | Any of the three proofs | 401, 403 |
| `tenantGuard` | An actor with a foothold in the URL's tenant, a service account only in its own. Applies the tenant's sign-in policy | 403 `forbidden`, `sso_required` |
| `orgGuard` | An actor bound to the organization or to a channel below it, or a system admin | 404 |
| `stepUpGuard`, `stepUpEnrollGuard`, `stepUpFactorGuard` | A session that recently proved its user again, as much as the action asks | 403 `step_up_required`, `impersonation_forbidden` |
| `sysAdminGuard` | A system admin from an allowed IP address, never an impersonation | 403 |
| `relatableGuard` | A caller who shares an organization with the user the request names, or a system admin | 403 |

`tenantGuard` and `orgGuard` read the actor's bindings, whatever proved it, so a service account passes them as a member does. They turn away only an actor with no foothold at all; what a member may do with a row is the engine's answer, on the paths above.

## Refusals

One answer per situation, so no route, app or test meets two shapes for one cause. A refusal the caller's request or state brings about carries severity `warn` (a warning toast, no log id); `error` is kept for the app's own faults, such as a row that must exist and is gone.

| Situation | Answer | Why |
| --- | --- | --- |
| The tenant: missing, inactive, none of the actor's, or not an API key's own | 403 `forbidden`, `meta.resource: 'tenant'` | Every member knows the tenant id, so the answer only says "not yours" and ids cannot be enumerated |
| Anything under a tenant the caller may not read, missing and unreadable alike: an organization, a channel or product, a home channel named in a list query, an invitation | 404 `not_found` with `entityType` | A 403 would confirm the id. A key or token without the entity's scope reads it as missing too |
| An action denied on a row the caller reads; a create the placement denies; a bulk call where nothing is allowed | 403 `forbidden`, `entityType`, `meta.action` | The caller already knows the row |
| A list option the caller may not use, such as another user's role filter | 403 `forbidden`, `meta.reason` | Refused, never dropped: a dropped option answers a narrower question with the wider list |
| Another user the caller shares no organization with, missing and unshared alike | 403 `forbidden`, `entityType: 'user'` | One answer hides existence, as a 404 would |
| An organization slug another organization holds, in any tenant | 409 `slug_exists` from create and rename; the slug check answers 409 taken, 204 free | A slug is the organization's public URL path and unique across tenants, and every route gives the same answer, so availability is the policy and no leak |
| A token this browser does not hold, or one that expired | 401 `<type>_not_found` or `<type>_expired` | The token was the proof, so without it the request is not authenticated |
| A link or invitation of another account than the signed-in one | 409 `user_mismatch` | The request conflicts with the signed-in account, not with its own shape |
| An address or provider account another account holds | 409 `oauth_email_exists`, `oauth_conflict` or `oauth_wrong_email` | The caller's state, not a fault of the app |
| Not signed in, or a session that ended | 401 `unauthorized`, `no_session`, `session_expired` or `session_revoked` | The frontend sends a person to sign-in on these four alone |
| A tenant quota that is full | 403 `restrict_by_app` with `meta.resource` and `meta.quota`; `restrict_by_org` for member seats | The tenant's policy, not a rate: waiting does not lift it, so never a 429 |
| An account-security route without the recent proof it asks | 403 `step_up_required` naming the methods | `withStepUp` opens the proof dialog on it and runs the action again |
| An action on the account itself while impersonating | 403 `impersonation_forbidden` | The admin acts as the user, never on the account |
| A sign-in method the tenant does not allow for this person | 403 `sso_required` with the connection | The tenant decides how the people it knows through a connection sign in |

## What members see

Users who share an organization see each other's `UserBase` fields, email address included: in member lists, through `getUser`, and in `getUsers`, whose search matches name and address. Co-members also see `lastSeenAt`, when the user was last active in any of their tenants. It is stamped on the user's own GET requests, never while an admin impersonates them. The directory is organization-wide, so a channel below the organization narrows nothing. A member also sees the addresses invited to a channel they read, never the account behind one; resending an invitation takes `update` on that channel. The privacy statement tells users the same, so a change here changes that text too.

## Behavior

| Scenario | Outcome |
| --- | --- |
| Member with `update: 'own'` edits someone else's row | Denied: the UI resolves `'own'` against the row's creator, and the backend refuses a save all the same |
| Actor loses access mid-Yjs-session | The socket closes when its short-lived token expires, and a reconnect is authorized again |
| System admin joins a Yjs collab session | No bypass: authorized as the acting user |
