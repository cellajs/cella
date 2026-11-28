# Permissions

This document explains Cella's contextual RBAC: how the permission engine answers **may this actor perform this action on this subject?** in every route, list, stream and control.

### TL;DR

**Every check presents an access, consults the policy and returns a permission.** The permission
engine combines the user's memberships, the rules you configure for their roles, and values on the
row. Roles are assigned on containers such as organizations, and content inside uses those roles.
Creator-only rules compare the user with the row's `createdBy` value.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Channel** | Holds roles and memberships. `organization` is the fixed spine every channel nests under. |
| **Product** | Holds no roles and inherits from the channels above it. Must have a channel parent. |
| **Home** | The channel a product row lives in: its deepest non-null channel ancestor. |
| **Membership** | A user's role on one channel. |
| **Elevated role** | A role whose grants on products and people also reach the rows homed below its channel. |
| **Actor** | Who acts: a user or a service account. |
| **Binding** | A role on a channel, whoever holds it: a membership for a user, a stored binding for a service account. |
| **Subject** | What is acted on: entity type, optional id, its ancestor channel ids, optionally the row. |
| **Policy cell** | `0` denies, `1` allows, and a row-condition name such as `'own'` allows on qualifying rows. |
| **Action** | `create`, `read`, `update`, `delete`. |
| **Access scope** | The mask an API key or access token puts over its actor's bindings. |

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

The permission engine **never loads rows**: callers hand in the row data a decision needs. That lets the same code run on the server and in the browser.

## The access presented

Every check takes an `Access`: the actor with its bindings and scopes, or anonymous. Handlers get it from `accessFrom(ctx)`, never by hand.

- **Session:** unmasked.
- **API key or access token:** every decision narrows to its scopes.
- **People:** a key or token that carries scopes reads them only with `user:read`. A key issued with `all` reads them as its actor does.

A membership change reaches every check within seconds.

## The policy consulted

You declare the channels, their roles and the products inside them in **`shared/config/hierarchy-config.ts`**, a fluent builder:

```ts
export const roles = createRoleRegistry(["admin", "member"] as const);

export const hierarchy = createEntityHierarchy(roles)
  .user()
  .organization({ roles: roles.all, elevated: ["admin"] })
  .product("attachment", { parent: "organization" })
  .build();
```

You declare what each role may do in **`shared/config/permissions-config.ts`**, the matrix:

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
      case "user":
        channels.organization.admin({ read: 1 });
        channels.organization.member({ read: 1 });
        break;
    }
  },
);
```

You change the two files together: the matrix names the hierarchy's channels and roles. Each line such as `channels.organization.member(...)` is a row of the matrix: one role on one channel, with a cell per action. Policies only declare grants: omitted actions and missing rows deny.

A product row's **home** is the channel it lives in: the product's declared parent, or a channel above it when you declare the parent's id nullable in `nullableAncestors` and the row leaves it empty. Each membership is homed at its channel.

- **Self** rows, on the channel itself: what the channel's members may do to it.
- **Elevation** rows, on an ancestor channel: what a parent's member may do to the child. Only they grant `create`, since nobody is a member of a channel that does not exist yet.
- **Home** rows, the only kind a product has: what a role may do to the rows homed at its channel. `create` grants creating inside that channel.
- **People** (`user`) have home rows too. Only `read` may be granted, and it decides whom a role sees ([What members see](#what-members-see)).

Grants on products and people follow three rules:

- A role's grants reach only the rows homed at its channel.
- A role you declare `elevated` in the hierarchy reaches the rows homed at its channel and everything below it.
- No grant reaches rows homed above its channel.

A channel has no home: a grant above it counts in full for it.

Say your app makes projects the parent of attachments. An organization member then opens a project's attachments only through a role in that project, and an elevated organization admin opens them all.

A membership is written through a path its channel's managers allow, such as an invitation. The only derived memberships are the ones a membership brings along above its channel: the organization's, and that of the channel the menu nests it under, where there is one.

You declare a channel's roles from most to least privileged. That order decides who may grant what:

- **No higher role:** nobody hands out a role above the one they hold on the channel.
- **No higher member:** nobody demotes or removes a member who holds a role above theirs.
- **Invitations:** checked when sent, since the accept has no inviter to ask. Refused when the accept brings a membership above the channel, at a role above the inviter's.
- **Least role:** anyone may give the least-privileged role.
- **Any role:** a system admin, or anyone whose `update` or `delete` grant reaches the channel from an ancestor.
- **Service accounts:** the same rules hold for creating one, issuing or rolling its keys and re-enabling it.

You may name a `defaultRole` for a channel: the role a person or an API key's account starts at when nobody picks one. Without it the default is the least role. It changes none of the rules above: the least role stays the one anyone may give.

## The permission returned

The **`checkAccess*` family** is what every tier calls:

```ts
checkAccess(access, action, subject); // → PermissionResult: the request-path check
checkAccessBatch(access, action, subjects); // → Map of PermissionResult by subject id: one actor, many rows (list splitting)
checkAccessFanout(accesses, action, subject); // → boolean[]: many actors, one row (stream fan-out)
```

Each ancestor channel id of a subject is **tri-state**:

- a channel id
- `null`: explicitly not under that ancestor
- `undefined`: a required id left out, which throws

## Row conditions

Two mechanisms read the row's columns:

- **Row condition:** a name such as `'own'` in a policy cell grants only on matching rows, where a `1` grants on every row the role reaches.
- **Public read:** widens only `read`, to rows whose `public` flag is set, for any actor, anonymous included.

The set is **closed** to `own` and `public`: every rule must be evaluable from the row alone, in JS, compiled SQL, the frontend and dispatch. No cross-row or app-defined condition exists.

You declare public read per entity type with `publicRead()`. The server keeps each row's flag equal to its home channel's:

- **Create or move:** the row takes its home's flag.
- **Channel flag change:** rewrites the rows homed there in the same transaction, soft-deleted ones included, up to a row cap.
- **Going private:** readers who had a row through its flag alone lose it, as they lose a row that moves.

The file of a public row signs for a visitor on the anonymous presign route, which the same grant decides. An app that declares no public read on attachments signs nothing there.

### Drafts

A row whose `publishedAt` is null is a draft, checked before the permission engine. A product draft shows to its author alone.

A file uploaded into a document that is not published yet is a draft too, when its create says `draft`. It signs for its uploader alone and becomes readable when the document's publish publishes it. Without that, a reader of the channel can open the files of a document they cannot see.

A channel starts as a draft only when you declare `drafts: { prepareRoles }` in its hierarchy entry and the create asks for one. It then shows to its members and to a grant above it that holds `update` on its type.

A draft channel's invitations wait for the publish. Those for its `prepareRoles` go out at once, so those people can set it up.

## Archived channels

Archiving closes a channel below the organization to writes and keeps it readable. The organization itself is never archived, only its tenant.

- **No writes.** It refuses every write to itself, every create inside it and every change to a product homed in it, system admins included.
- **Still readable.** It reads and streams as before. A list shows it when asked.
- **Nobody stuck.** A member can still be removed or leave.
- **LTI tabs closed.** Its tabs of LTI tools do not open, and their LTI tools read no members there, until it is unarchived.
- **Delete or unarchive.** Both stay possible with the matching grant, `delete` or `update`.
- **Nested channels keep their state.** The archive action offers to include them, with a default each app sets.

## In the interface

The frontend asks the permission engine only to shape the interface. The backend decides. A control calls `can(action, entityType, row)` from `useCan`, which runs `checkAccess` over the user's memberships. A control with no row, such as a create button, asks about a new row of that type homed at the channel.

`useCan({ asMember: true })` leaves out the system-admin bypass, as the Yjs relay does. `useCan` also applies the archive veto from the cached channel rows. `useCan({ ignoreArchive: true })` leaves it out, for the Settings tab and the unarchive control, which must stay reachable on an archived channel.

A channel's tabs ask the same question before a tab loads: `guardNavTabs` sends the user from a tab whose `requires` their grants lack to the first tab they allow, or to the channel's default path. When the memberships cannot be read, it lets the user through and the server decides.

## Enforcement paths

| Path | Guard or helper | What it checks | On failure |
| --- | --- | --- | --- |
| Guard chain | [Guards](#guards) | Who acts, and whether they are in the tenant and the organization. Never consults the policy matrix. | 4xx before the handler ([Refusals](#refusals)) |
| Single row | `getValidProduct`, `getValidChannel` | Loads the row, checks it is in the request's tenant and organization, runs the permission engine | 404 for a row the caller may not read, 403 for a denied action on one it reads |
| Create | `canCreateEntity` | No row exists yet. The subject describes the would-be placement | 403 |
| Bulk | `splitByPermission` | The single-row checks for every id | Rejected ids listed, a row a batch update's write refuses with 403 among them. 403 only when nothing is allowed |
| Collection read | `buildCollectionReadWhere` | Compiles readable scope, row conditions, and public read into one SQL predicate. Never loads rows to reject them. | An empty list |
| SSE dispatch | `accessDecisions` | One `checkAccessFanout` per change or signal over the organization's subscribers | No frame. A change sent too wide leaks data because announced rows are fetchable |
| Catchup views | `resolveViewReadStatus` | May the caller see an organization's frontier of a type | `opaque` or `forbidden` |

**The system-admin bypass applies to collection reads too**. **Any grant the single-row path honours must appear in lists and over SSE**.

When an actor loses access during a Yjs session, the socket closes as its short-lived token expires, and a reconnect is authorized again.

Aggregates such as member counts, newest-post times and organization totals run no row condition. They count every live row of the organization. If you add an `own` or `public` read cell, scope them yourself, or they count rows a viewer cannot list.

### Guards

You list a route's guards in `xGuard`, and they run in that order before the handler. The first proves who acts. The next ones check that the actor is in the tenant and the organization the URL names.

Organization content runs behind `[userGuard, tenantGuard, orgGuard]`. Where an API key or access token may call, `actorGuard` takes the place of `userGuard`. The user's account runs behind `[userGuard]` alone.

| Guard | Admits | Refuses with |
| --- | --- | --- |
| `publicGuard` | Anyone, with no actor | Nothing |
| `userGuard` | A session cookie: the signed-in user. The actor's bindings leave out a tenant whose sign-in policy refuses the session | 401 |
| `serviceGuard` | An API key or an access token other than an installed LTI tool's, masked by its scopes, never a system admin | 401; 403 from a browser origin |
| `tokenGuard` | An access token other than an installed LTI tool's, for the MCP face | 401 |
| `ltiToolGuard` | An installed LTI tool's access token alone, with the binding its tab that opens implies in exactly the channel in the path ([LTI](./LTI.md#serving-members)) | 401 |
| `actorGuard` | Any of the three proofs | 401, 403 |
| `tenantGuard` | An actor with a foothold in the URL's tenant, a service account only in its tenant. Applies the tenant's sign-in policy | 403 `forbidden`, `sso_required` |
| `orgGuard` | The URL's organization in the tenant `tenantGuard` admitted to, for an actor bound to it or to a channel below it, or a system admin | 404 |
| `stepUpGuard`, `stepUpEnrollGuard`, `stepUpFactorGuard` | A session that recently proved its user again, as much as the action asks | 403 `step_up_required` |
| `sysAdminGuard` | A system admin from an allowed IP address | 403 |

## Refusals

Each situation has one answer: no route, app or test meets two shapes for one cause.

A refusal the caller's request or state brings about carries severity `warn` or `info` and no log id. Severity `error` is kept for the app's faults, such as a row that must exist and is gone.

The members an answer names beside its type, such as `resource`, are top-level members of the error body.

| Situation | Answer | Why |
| --- | --- | --- |
| The tenant: missing, inactive, none of the actor's, or not an API key's tenant | 403 `forbidden`, `resource: 'tenant'` | A tenant id is no secret: every member knows it, and the one answer only says "not yours" |
| Anything under a tenant the caller may not read, missing and unreadable alike: an organization the tenant does not hold, a channel or product, a home channel named in a list query, an invitation | 404 `not_found` with `entityType` | A 403 would confirm the id. A key or token without the entity's scope reads it as missing too |
| An action denied on a row the caller reads, a create the placement denies, or a bulk call where nothing is allowed | 403 `forbidden`, `entityType` | The caller already knows the row |
| A channel's members or invitations, or an invite, for a caller whose roles do not read that channel's people | 403 `forbidden`, `entityType: 'user'` | The caller reads the channel: the answer names what it may not read |
| A write in an archived channel, or into one | 403 `channel_archived` with `entityType` | The caller reads the channel, so the answer names the state that refuses, not the id |
| A role above the caller's on the channel: granted, brought along by an accept, held by the member or service account acted on | 403 `forbidden`, `reason: 'role_exceeds_actor'`, `role` | The caller may act on the channel: the answer names the role it may not hand out |
| A list option the caller may not use, such as another user's role filter | 403 `forbidden`, `reason` | Refused, never dropped: a dropped option answers a narrower question with the wider list |
| Another user the caller does not see, missing and unseen alike | 403 `forbidden`, `entityType: 'user'` | One answer hides existence, as a 404 would |
| An organization slug another organization holds, in any tenant | `slug_exists` from create and rename. The slug check answers 409 taken, 204 free | A slug is the organization's public URL path, unique across tenants. Every route gives the same answer, so availability is the policy and no leak |
| A token this browser does not hold, or one that expired | 401 `<kind>_not_found` or `<kind>_expired` | The token was the proof, so without it the request is not authenticated |
| A passkey the server does not hold for the account | 404 `passkey_not_found` | The credential id comes from the caller's authenticator: the answer reveals no account |
| A link or invitation of another account than the signed-in one | 409 `user_mismatch` | The request conflicts with the signed-in account, not with the request's shape |
| An address the provider verified, or a provider account, that another account holds | 409 `oauth_email_exists`, `oauth_conflict` or `oauth_wrong_email` | The caller's state, not a fault of the app. An unverified address answers as a free one, so the answer tells nobody whether an account holds it |
| Not signed in, or a session that ended | 401 `unauthorized`, `no_session`, `session_expired` or `session_revoked` | The frontend sends a person to sign-in on these four alone |
| A tenant quota that is full | 403 `restrict_by_app`, or `restrict_by_org` for member seats | The tenant's policy, not a rate. Waiting does not lift it, so never a 429 |
| A tenant's invitation mails for the day spent | 429 `invitation_limit_reached` with `retryAfter` | A rate: the next day lifts it, and a system admin raises the tenant's `invitationEmailsPerDay` |
| An account-security route without the recent proof it asks | 403 `step_up_required` naming the methods | `withStepUp` opens the proof dialog on it and runs the action again |
| A sign-in method the tenant does not allow for this person | 403 `sso_required` with the connection | The tenant decides how the people it knows through a connection sign in |

## What members see

A role's `read` on `user` decides whom its holders see. Someone sees a person when their roles read one of that person's memberships:

- Every member holds a membership of the organization: an organization role that reads people sees the whole directory.
- A role on a channel below sees that channel's members.
- An elevated role sees the members of its channel and everything below it.
- Everyone sees themselves, and a system admin sees everyone.

Someone who is in the organization only through a channel holds the organization role that channel's membership brings along (`organizationRoles`), and that role decides what they see there. If you give that role no grant on people or on the channels below, such a person sees the people of their channels alone. A role for people invited to the organization itself can see more.

The people a member sees show their `UserBase` fields, email address included: in member lists, on their profile and in the user search, which matches name and address. They also show `lastSeenAt`, when the user was last active in any of their tenants.

The directory and a channel's member list are two reads. A channel's member list and its invitations need the read of people at that channel: a grant reaches the memberships of its channel, and only an elevated role reaches those of the channels below. An organization member whose role reads people, but is not elevated, sees everyone in the directory yet may not open a project's member list without a role there that reads people.

Inviting takes `update` on the channel and the read of its people, and resending an invitation takes `update` on that channel. The invitations show the addresses invited, never the account behind one. An organization member the inviter does not see, because the inviter reads this channel's people but not the directory, gets an invitation they accept, as an address outside the organization does.

Member counts, per role and pending, are not people: whoever reads the channel sees them. The name and avatar of whoever wrote a row a member reads stay visible, whoever it is.

If you change what members see, change the privacy statement too: it tells users the same.

## System admins

A system admin holds the `admin` system role, which counts only on a request from an allowed address ([Authentication](./AUTHENTICATION.md)). The permission engine allows them every action. The guards let them through without a membership, on a session only.

A system admin opens any organization from the system panel and sees the pages a member sees, with every control. Nobody acts as another user. A support change runs as the admin and shows under the admin's name in the organization's activities.

A system admin never reaches a user's inbox, menu or preferences. Of a user's account security they reach only recovery, with a step-up of their own: signing the person out everywhere or removing a lost factor, each mailed to the person. They join a collaborative description with only their account's access.

Support reads before it writes, in the users table and the organization's members page. To see a page as a given role sees it, invite an account with no system role at that role, and remove it after the case. The organization's admins can read both moves as activities.

Make the change as yourself and tell the user what changed. Never hand anyone a session.

A user recovers from account-security trouble, such as a lost factor, through the step-up and recovery paths. A system admin's sign-out ends a user's sessions, as deleting the account or a `cookieVersion` bump for everyone does.
