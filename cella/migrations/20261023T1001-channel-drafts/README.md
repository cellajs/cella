---
syncBreaking: true
clientCacheBump: false
---

# Channel drafts are declared in the hierarchy

A channel type that can start unpublished declares `drafts: { prepareRoles: [...] }` on its `organization()` or
`channel()` entry in `shared/config/hierarchy-config.ts`. While a channel is a draft, invitations for its prepare roles
go out at once and the rest wait until it is published. An app that creates draft channels must add the declaration: without
it every invitation to such a draft waits, the roles that set it up included. Nothing fails to compile.

## What & why

The roles invited at once used to be implicit: the first role in the channel's list. The hierarchy now says it, and
`hierarchy.canDraft(type)` and `hierarchy.getPrepareRoles(type)` read it. Cella declares `admin` for organizations, adds
`draft` to the organization create body, `PUT /{tenantId}/organizations/{id}/publish`, the generic `DraftBanner`
(`frontend/src/modules/entities/draft-banner.tsx`) and a line under the invite role choice. A prepare-role invitation to
an existing account now shows in the invitee's own invitations while the channel is a draft.

## Blast radius

Apps that create draft channels, such as projectcampus courses, sections and projects. Sync-breaking in behavior only:
until the app declares `drafts`, staff invited to a draft course are held. No database or cache change.

## Run

No script: manual.

## Manual steps

1. For each channel type the app creates as a draft (`publishedAt: null` in its create operation), add `drafts: { prepareRoles: [<its first role>] }` to its hierarchy entry; that keeps today's behavior.
2. Optionally render `DraftBanner` under the page header of such a channel and pass the app's own publish form, in place of a channel-specific banner.
3. To keep organizations from starting as drafts, remove `drafts` from `organization()`: the create switch and the band then stay hidden.

## Verify

```sh
pnpm check
```
