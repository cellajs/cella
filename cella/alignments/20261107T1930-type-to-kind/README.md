---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: tokenTypes, appNotificationTypes, notification-types, requestTypeEnum, SessionType, NotificationType, TokenType, requestType, confirm-link/$type
generate: true
---

# Sessions, tokens, notifications and requests name their kind `kind`

`sessions.type`, `tokens.type`, `notifications.type` and `requests.type` are `kind`: in the tables, the API, the SDK, the
push payload and the token routes' path parameter, whose URLs stay the same. `appConfig.tokenTypes` is `tokenKinds`, the
pinned `app-schemas.ts` exports `appNotificationKinds`, `notification-types.ts` is `notification-kinds.ts`, and
`TokenType`, `SessionType`, `NotificationType` and `requestTypeEnum` are `TokenKind`, `SessionKind`, `NotificationKind`
and `requestKinds`. A module's `resolveRecipients` returns `{ userId, kind }`. `pnpm generate` with this folder's
`hints.json` renames the four columns and two indexes.

## What & why

`actors.kind` and `connections.kind` classify rows, and these four columns did the same under `type`. The rule now in
AGENTS.md: `type` selects a shape (an entity type, an event type, a union's discriminant, a standard's own field), and
`kind` classifies rows or values that share one shape. `activities.type` holds an event type and `oidc_payloads.type`
names the provider model its payload belongs to, so both keep their name.

## Blast radius

Every app: `backend/drizzle` is app-owned, and the typecheck names each typed read. An outside API client that sends or
reads `type` on a request, a session or a notification breaks; mailed links keep working. `clientCacheVersion` moves to
`v38-type-to-kind`. No lens.

## Run

No script: manual.

## Manual steps

1. Generate the migration with the hints of `hints.json`: `cd backend && pnpm tsx scripts/generate.ts --name type_to_kind --hints '<hints.json as one line>'`. It renames four columns and two indexes and recreates the two partial unique indexes whose predicate names a renamed column; no hand-written SQL.
2. In the pinned `backend/src/schemas/app-schemas.ts`, rename `appNotificationTypes` to `appNotificationKinds`. An app config that sets `tokenTypes` names it `tokenKinds`.
3. App code that reads an old name fails the typecheck: take the new one. A module's `resolveRecipients` returns `kind` for each recipient.
4. Raw SQL of the app's own that names one of the four columns, test bodies sent untyped (`JSON.stringify`, `as never`) and JSON fixtures: rename the field, or the query fails and the request is refused.
5. An `app.json` override of `email.received_request.title` or `email.request.subject` takes the slots `{{kind}}` and `{{requestKind}}`.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
pnpm --filter backend test
```
