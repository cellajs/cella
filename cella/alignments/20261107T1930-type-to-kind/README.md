---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: tokenTypes, appNotificationTypes, notification-types, requestTypeEnum, SessionType, NotificationType, TokenType, requestType, confirm-link/$type, oauthFlowTypes, PasskeyVerifyType, type=connect, type=auth
generate: true
---

# Fields that classify one shape are named `kind`

`sessions.type`, `tokens.type`, `notifications.type` and `requests.type` are `kind`: in the tables, the API, the SDK, the
push payload and the token routes' path parameter, whose URLs stay the same. `appConfig.tokenTypes` is `tokenKinds`, the
pinned `app-schemas.ts` exports `appNotificationKinds`, `notification-types.ts` is `notification-kinds.ts`, and
`TokenType`, `SessionType`, `NotificationType` and `requestTypeEnum` are `TokenKind`, `SessionKind`, `NotificationKind`
and `requestKinds`. A module's `resolveRecipients` returns `{ userId, kind }`. `pnpm generate` with this folder's
`hints.json` renames the four columns and two indexes. The OAuth and SSO start routes take the flow as `kind`
(`?kind=connect`), and the passkey challenge and sign-in bodies name theirs `kind`.

## What & why

`actors.kind` and `connections.kind` classify rows, and these four columns did the same under `type`. The rule now in
AGENTS.md: `type` selects a shape (an entity type, an event type, a union's discriminant, a standard's own field), and
`kind` classifies rows or values that share one shape, the OAuth flow and the passkey challenge included.
`activities.type` holds an event type and `oidc_payloads.type` a provider model, so both keep their name.

## Blast radius

Every app: `backend/drizzle` is app-owned; the typecheck names each typed read. An outside API client that sends or
reads an old `type` field breaks. Mailed links keep working; an OAuth round trip open at deploy resumes as a sign-in.
`clientCacheVersion` moves to `v38-type-to-kind`. No lens.

## Run

No script: manual.

## Manual steps

1. Generate the migration with the hints of `hints.json`: `cd backend && pnpm tsx scripts/generate.ts --name type_to_kind --hints '<hints.json as one line>'`. It renames four columns and two indexes and recreates the two partial unique indexes whose predicate names a renamed column; no hand-written SQL.
2. In the pinned `backend/src/schemas/app-schemas.ts`, rename `appNotificationTypes` to `appNotificationKinds`. An app config that sets `tokenTypes` names it `tokenKinds`.
3. App code that reads an old name fails the typecheck: take the new one. A module's `resolveRecipients` returns `kind` for each recipient.
4. Raw SQL of the app's own that names one of the four columns, URLs it builds with `URLSearchParams` (`type=connect`), test bodies sent untyped (`JSON.stringify`, `as never`), hand-made `oauth-state` cookies and JSON fixtures: rename the field, or the query fails, the request is refused or the flow falls back to a sign-in.
5. An `app.json` override of `email.received_request.title` or `email.request.subject` takes the slots `{{kind}}` and `{{requestKind}}`.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
pnpm --filter backend test
```
