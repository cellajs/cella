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
│      │  5. emit `can`       one boolean per action              │            │
│      └───┬───────────┬────────────────┬────────────────┬────────┘            │
│          │           │                │                │                     │
│   ┌──────▼─────┐ ┌───▼──────────┐ ┌───▼───────────┐ ┌──▼─────────────┐       │
│   │ Backend    │ │ SSE dispatch │ │ Yjs relay     │ │ Frontend       │       │
│   │ routes     │ │              │ │               │ │                │       │
│   │ single row │ │ per change,  │ │ WS upgrade,   │ │ `useCan` per   │       │
│   │ + compiled │ │ every        │ │ no backend    │ │ control, over  │       │
│   │ SQL for    │ │ subscriber   │ │ round-trip    │ │ memberships    │       │
│   │ list reads │ │ at once      │ │               │ │ (never trusted)│       │
│   └────────────┘ └──────────────┘ └───────────────┘ └────────────────┘       │
└──────────────────────────────────────────────────────────────────────────────┘
```

The engine **never loads rows**. Callers hand in the row data a decision needs. The two config files change together. Tenant isolation in the database is a separate layer: [Multi-tenancy](./MULTI_TENANCY.md).

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Channel** | Owns roles and memberships. `organization` is the fixed spine every channel nests under. |
| **Product** | Owns no roles and inherits from the channels above it. Must have a channel parent. |
| **Home** | A product row's deepest non-null channel ancestor: the channel the row lives in. |
| **Membership** | A user's role on one channel. |
| **Actor** | Who acts: a user or a service account. |
| **Binding** | A role on a channel, whoever holds it: a membership for a user, a stored binding for a service account. |
| **Subject** | What is acted on: entity type, optional id, its ancestor channel ids, optionally the row. |
| **Policy cell** | `0` denies, `1` allows, and a row-condition name such as `'own'` allows on qualifying rows. |
| **Action** | `create`, `read`, `update`, `delete`. |
| **Access scope** | The mask an API key or access token puts over its actor's bindings. |

## The access you present

Every check takes an `Access`: the actor with its bindings and scopes, or anonymous. Handlers get it from `accessFrom(ctx)`, never by hand. A session is unmasked. An API key or access token narrows every decision to its scopes. A membership change reaches every check within seconds, whatever wrote it.

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

Channel entities have two row kinds. **Elevation** rows on an ancestor channel say what a parent's member may do to the child, and only they grant `create`, since nobody is a member of a channel that does not exist yet. **Self** rows on the same channel say what the entity's own members may do to it.

Product entities have only **home** rows, where `create` grants creating inside that channel.

A row's home is the product's declared parent, or a channel above it when the hierarchy declares the parent's id nullable in `nullableAncestors`.

A role's product grants reach only rows homed at its own channel, unless the hierarchy declares the role `elevated` there. An elevated role's grants reach the channel's whole subtree. No grant reaches rows homed above its channel. Channel subjects are never home-scoped, so a grant above a channel counts in full for it.

A membership is a fact, written through a path that whoever manages its channel allows: an invitation, a direct add, a self-join, a sign-in through a connection or a sync.

The only derived memberships are the ones a membership brings along above its channel: the organization's, and the menu parent's where the menu nests the channel under another. No other ancestor gets one.

A channel declares its roles from most to least privileged, and that order decides who may grant what:

- **No higher role:** nobody hands out a role above their own on the channel.
- **No higher member:** nobody demotes or removes a member who holds a role above their own.
- **Invitations:** refused when the accept brings a membership above the channel, at a role above the inviter's.
- **Least role:** anyone may give the least-privileged role.
- **Any role:** a system admin, or anyone whose `update` or `delete` grant reaches the channel from an ancestor.
- **Service accounts:** the same rules hold for creating one, issuing or rolling its keys and re-enabling it.

An invitation is checked when it is sent, since its accept has no inviter to ask.

## The permission returned

The **`checkAccess*` family** is what every tier calls:

```ts
checkAccess(access, action, subject); // → PermissionResult: the request-path check
checkAccessBatch(access, action, subjects); // → Map of PermissionResult by subject id: one actor, many rows (list splitting)
checkAccessFanout(accesses, action, subject); // → boolean[]: many actors, one row (stream fan-out)
```

A subject's ancestor scope is **tri-state**:

- a channel id
- `null`: explicitly not scoped to that ancestor
- `undefined`: a required scope left out, which throws

A missing scope never defaults to unscoped, which would bypass permissions.

## Row conditions

Two mechanisms read the row's own columns. A **row condition** in a policy cell grants only on matching rows, where a `1` grants on every row in channel scope. **Public read** widens `read`, and nothing else, to rows whose `public` flag is set.

The set is **closed** to `own` and `public`. Every rule must be evaluable from the row alone, in JS, compiled SQL, the frontend and dispatch. So no cross-row or app-defined condition exists.

Public read is declared per subject with `publicRead()` and holds for any actor, anonymous included. The flag is row-local and never cascades. The server copies the home channel's flag onto a new row.

### Drafts

A row whose `publishedAt` is null is a draft, checked before the engine. A product draft shows to its author alone.

A channel starts as a draft only when its hierarchy entry declares `drafts: { prepareRoles }` and the create asks for one. It then shows to its own members and to a grant above it that holds `update` on its type.

A draft channel's invitations wait for the publish. Those for its `prepareRoles` go out at once, so those people can set it up.

## Archived channels

A channel below the organization can be archived, which closes it. The organization itself is never archived, only its tenant.

- **No writes.** It refuses every write to itself, every create inside it and every change to a product homed in it, system admins included.
- **Still readable.** It reads and streams as before, and a list shows it when asked.
- **Nobody stuck.** A member can still be removed or leave.
- **Delete or unarchive.** Both stay possible with the matching grant, `delete` or `update`.
- **Nested channels keep their state.** The archive action offers to include them, with a default each app sets.

Like a draft, an archive is checked before the engine, on the container's own flag: the channel for a write to it, the home channel for a product, and the target channel for a create. Nothing is derived from the channels above, so a live channel inside an archived one works as any live channel.

## In the interface

The frontend asks the engine. The backend decides. A control calls `can(action, entityType, row)` from `useCan`, which runs `checkAccess` over the user's memberships. A control with no row, such as a create button, asks about a new row of that type homed at the channel.

`useCan({ asMember: true })` leaves out the system-admin bypass, as the Yjs relay does. `useCan` also applies the archive veto from the cached channel rows. `useCan({ ignoreArchive: true })` leaves it out, for the Settings tab and the unarchive control, which must stay reachable on an archived channel.

A route gate, `requireEntityAction`, asks the same question before the page loads. When the memberships cannot be read, as offline with none cached, the gate lets the user through and the server decides.

## Enforcement paths

| Path | Guard or helper | What it checks | On failure |
| --- | --- | --- | --- |
| Guard chain | [Guards](#guards) | Who acts, and whether they are in the tenant and the organization. Never consults the policy matrix. | 401 or 403 before the handler ([Refusals](#refusals)) |
| Single row | `getValidProduct`, `getValidChannel` | Loads the row, checks it is in the request's tenant and organization, runs the engine | 404 for a row the caller may not read, 403 for a denied action on one it reads |
| Create | `canCreateEntity` | No row exists yet. The subject describes the would-be placement | 403 |
| Bulk | `splitByPermission` | The single-row checks for every id | Rejected ids listed. 403 only when nothing is allowed |
| Collection read | `buildCollectionReadWhere` | Compiles readable scope, row conditions, and public read into one SQL predicate. Never loads rows to reject them. | An empty list |
| SSE dispatch | `accessDecisions` | One `checkAccessFanout` per change or signal over the organization's subscribers | No frame. A change sent too wide leaks data because announced rows are fetchable |
| Catchup views | `resolveViewReadStatus` | May the caller see an organization's frontier of a type | `opaque` or `forbidden` |

Two rules bind every path. **The system-admin bypass applies to collection reads too**, since a system admin passes `orgGuard` with no membership. **Any grant the single-row path honours must appear in lists and over SSE**.

Aggregates such as member counts, newest-post times and organization totals run no row condition. They count every live row of the organization. An app that adds an `own` or `public` read cell must scope them itself, or they count rows a viewer cannot list.

### Guards

Every route lists its guards in `xGuard`, and they run in that order before the handler. The first proves who acts. The next ones check that the actor is in the tenant and the organization the URL names.

A guard declares what it reads of an earlier one. A route that lists them out of order fails when its module loads.

Organization content runs behind `[userGuard, tenantGuard, orgGuard]`, with `actorGuard` in place of `userGuard` where an API key or access token may call too. The user's own account runs behind `[userGuard]` alone.

| Guard | Admits | Refuses with |
| --- | --- | --- |
| `publicGuard` | Anyone, with no actor | Nothing |
| `userGuard` | A session cookie: the signed-in user | 401 |
| `serviceGuard` | An API key or an access token, masked by its scopes, never a system admin | 401; 403 from a browser origin |
| `tokenGuard` | An access token only, for the MCP face | 401 |
| `actorGuard` | Any of the three proofs | 401, 403 |
| `tenantGuard` | An actor with a foothold in the URL's tenant, a service account only in its own. Applies the tenant's sign-in policy | 403 `forbidden`, `sso_required` |
| `orgGuard` | The URL's organization in the tenant `tenantGuard` admitted to, for an actor bound to it or to a channel below it, or a system admin | 404 |
| `stepUpGuard`, `stepUpEnrollGuard`, `stepUpFactorGuard` | A session that recently proved its user again, as much as the action asks | 403 `step_up_required` |
| `sysAdminGuard` | A system admin from an allowed IP address | 403 |
| `relatableGuard` | A caller who shares an organization with the user the request names, or a system admin | 403 |

`tenantGuard` and `orgGuard` read the actor's bindings, so a service account passes them as a member does. They turn away only an actor with no foothold at all. What a member may do with a row is the engine's answer, on the paths above. A tenant holds one organization, so an actor bound to nothing in it gets `tenantGuard`'s 403.

## Refusals

One answer per situation, so no route, app or test meets two shapes for one cause.

A refusal the caller's request or state brings about carries severity `warn`: a warning toast and no log id. Severity `error` is kept for the app's own faults, such as a row that must exist and is gone.

The members an answer names beside its type, such as `resource`, are top-level members of the error body.

| Situation | Answer | Why |
| --- | --- | --- |
| The tenant: missing, inactive, none of the actor's, or not an API key's own | 403 `forbidden`, `resource: 'tenant'` | A tenant id is no secret: every member knows it, and the one answer only says "not yours" |
| Anything under a tenant the caller may not read, missing and unreadable alike: an organization the tenant does not hold, a channel or product, a home channel named in a list query, an invitation | 404 `not_found` with `entityType` | A 403 would confirm the id. A key or token without the entity's scope reads it as missing too |
| An action denied on a row the caller reads, a create the placement denies, or a bulk call where nothing is allowed | 403 `forbidden`, `entityType`, `action` | The caller already knows the row |
| A write in an archived channel, or into one | 403 `channel_archived` with `entityType` | The caller reads the channel, so the answer names the state that refuses, not the id |
| A role above the caller's own on the channel: granted, brought along by an accept, held by the member or service account acted on | 403 `forbidden`, `reason: 'role_exceeds_actor'`, `role` | The caller may act on the channel, so the answer names the role it may not hand out |
| A list option the caller may not use, such as another user's role filter | 403 `forbidden`, `reason` | Refused, never dropped: a dropped option answers a narrower question with the wider list |
| Another user the caller shares no organization with, missing and unshared alike | 403 `forbidden`, `entityType: 'user'` | One answer hides existence, as a 404 would |
| An organization slug another organization holds, in any tenant | 409 `slug_exists` from create and rename. The slug check answers 409 taken, 204 free | A slug is the organization's public URL path, unique across tenants. Every route gives the same answer, so availability is the policy and no leak |
| A token this browser does not hold, or one that expired | 401 `<kind>_not_found` or `<kind>_expired` | The token was the proof, so without it the request is not authenticated |
| A passkey the server does not hold for the account | 404 `passkey_not_found` | The credential id comes from the caller's own authenticator, so the answer reveals no account |
| A link or invitation of another account than the signed-in one | 409 `user_mismatch` | The request conflicts with the signed-in account, not with its own shape |
| An address the provider verified, or a provider account, that another account holds | 409 `oauth_email_exists`, `oauth_conflict` or `oauth_wrong_email` | The caller's state, not a fault of the app. An unverified address answers as a free one, so the answer tells nobody whether an account holds it |
| Not signed in, or a session that ended | 401 `unauthorized`, `no_session`, `session_expired` or `session_revoked` | The frontend sends a person to sign-in on these four alone |
| A tenant quota that is full | 403 `restrict_by_app` with `resource` and `quota`, or `restrict_by_org` for member seats | The tenant's policy, not a rate. Waiting does not lift it, so never a 429 |
| A tenant's invitation mails for the day spent | 429 `invitation_limit_reached` with `retryAfter` | A rate: the next day lifts it, and a system admin raises the tenant's `invitationMailsPerDay` |
| An account-security route without the recent proof it asks | 403 `step_up_required` naming the methods | `withStepUp` opens the proof dialog on it and runs the action again |
| A sign-in method the tenant does not allow for this person | 403 `sso_required` with the connection | The tenant decides how the people it knows through a connection sign in |

## What members see

Users who share an organization see each other's `UserBase` fields, email address included. They see them in member lists, through `getUser` and in `listUsers`, whose search matches name and address. The directory is organization-wide, so a channel below the organization narrows nothing.

Co-members also see `lastSeenAt`, when the user was last active in any of their tenants. The user's own GET requests stamp it.

A member also sees the addresses invited to a channel they read, never the account behind one. Resending an invitation takes `update` on that channel.

The privacy statement tells users the same, so a change here changes that text too.

## System admins

A system admin holds the `admin` system role, which counts only on a request from an allowed address ([Authentication](./AUTHENTICATION.md)). The permission engine allows them every action. Every guard but `serviceGuard` lets them through without a membership.

So a system admin opens any organization from the system panel and sees the pages a member sees, with every control. Nobody acts as another user. A support change runs as the admin and shows under the admin's name in the organization's activities.

A system admin never reaches a user's account security, inbox, menu or preferences. They join a collaborative description with only their own account's access.

Support reads before it writes, in the users table and the organization's members page. To see a page as a given role sees it, invite an account with no system role at that role, and remove it after the case. The organization's admins can read both moves as activities.

Make the change as yourself and tell the user what changed. Never hand anyone a session.

A user recovers from account-security trouble, such as a lost factor, through the step-up and recovery paths. No system admin route ends a user's sessions: only deleting the account does, or a `cookieVersion` bump for everyone.

## Behavior

| Scenario | Outcome |
| --- | --- |
| Member with `update: 'own'` edits someone else's row | Denied: the UI asks the engine on the row, and the backend refuses a save all the same |
| Actor loses access mid-Yjs-session | The socket closes when its short-lived token expires, and a reconnect is authorized again |
| System admin joins a Yjs collab session | No bypass: authorized as the acting user |
