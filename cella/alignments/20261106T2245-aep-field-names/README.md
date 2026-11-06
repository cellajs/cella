---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: firstName, lastName, first_name, last_name, timezone, c:language
generate: true
---

# Users and organizations take AEP's standard field names

`users.firstName`, `lastName` and `language` are `givenName`, `familyName` and `languageCode`, and `organizations.country`
and `timezone` are `regionCode` and `timeZone`: in the tables, the API, the SDK and the notification `actor`
(`givenName`). `pnpm generate` with this folder's `hints.json` renames the five columns. The labels `c:first_name`,
`c:last_name`, `c:language` and `c:timezone` are `c:given_name`, `c:family_name`, `c:language_code` and `c:time_zone`,
and the organization form labels its region field with the new `c:region_code`.

## What & why

AEP-148 names a person's `given_name` and `family_name`, since neither comes first or last in every culture, and AEP-143
names the codes `language_code`, `region_code` and `time_zone`; the wire spells them in camelCase. `TransformedUser`,
`SsoProfile` and `PendingSignUp` take the new keys, and provider claims keep theirs. An optional `language` key that a
user object is passed into escapes the compiler and reads undefined.

## Blast radius

Every app: `backend/drizzle` is app-owned, and the typecheck names each typed read. An outside API client that reads an
old name breaks. `clientCacheVersion` moves to `v36-aep-field-names` and the persisted user store to version 2, so
browsers drop their cached users and organizations. No lens.

## Run

No script: manual.

## Manual steps

1. Generate the migration with the hints of `hints.json`: `cd backend && pnpm tsx scripts/generate.ts --name aep_field_names --hints '<hints.json as one line>'`. It writes five `ALTER TABLE ... RENAME COLUMN` statements and nothing else; no hand-written SQL.
2. In the pinned `backend/scripts/seeds/showcase.json`, rename `admin.firstName` and `admin.lastName` to `givenName` and `familyName`.
3. App code that names one of the four old labels fails the typecheck: take the new key. An app that overrides one in `app.json` renames its key there. A form field of the app's own finds its invalid-field label under the field's snake_case key (`c:region_code` for `regionCode`).
4. Rename the optional keys of the app's own shapes that a user or an organization is passed into, such as `{ language?: string }`: the compiler accepts the wider object and the key reads undefined.
5. Test bodies sent untyped (`as never`) and JSON fixtures that name an old field: rename the key, or the request drops it.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
pnpm --filter backend test
```
