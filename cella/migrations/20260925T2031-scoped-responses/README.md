# Narrower responses outside the caller's scope; email params escaped once

## What & why

`getUsers` shows, filters and sorts by system role only for system admins. The pending invitations list drops `userId`
and gives `tokenId` only to callers who may update the channel. `markSeen` uses the read scope. Idempotent replays
return only the caller's rows. `relatableUserId` must be a uuid. Email: `neutralizeBrevoTags` keeps only `{{params.x}}`,
HTML params are declared in `htmlParams`, and `htmlToExcerpt` returns plain text. Schema messages use `translatedError`.

## Blast radius

Sync-breaking for apps reading those fields, using `checkIdempotency`, passing HTML in email params, or translating
schema messages at module load. No database change.

## Run

No script: manual.

## Manual steps

1. App creates behind `checkIdempotency` filter on `createdBy`.
2. App email templates declare HTML params in `htmlParams`.
3. Replace module-load `t()` calls in schemas with `translatedError(key)`.
4. Pass `canResend` to the pending table's `useColumns`.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security backend/tests/emails
pnpm check
```
