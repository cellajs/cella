---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: execute, bin.cjs
---

# Drizzle 1.0.0-rc.6: snapshot format 10 and dates from raw queries

Run `drizzle-kit up` once over the app's `backend/drizzle`: drizzle-kit rc.6 reads Postgres snapshot format 10 only, and
`pnpm generate` refuses the app's format 9 snapshots until then. Then read the app's own raw queries
(`db.execute(sql…)`): a `timestamptz`, `timestamp` or `date` column they return is a `Date` now, where rc.5 gave text.

## What & why

`drizzle-orm` and `drizzle-kit` move from 1.0.0-rc.5 to 1.0.0-rc.6. drizzle-kit bumps the Postgres snapshot format to 10,
dropping `concurrently` from index entries, and ships ESM only: the template's generate and studio scripts call
`drizzle-kit/bin.js`, no longer `bin.cjs`. drizzle-orm no longer sets node-postgres type parsers on a raw query, so
`db.execute` returns what node-postgres parses. Builder queries (`db.select`, `.returning()`) return the same values as before.

## Blast radius

Every app. `backend/drizzle` is app-owned, so the template's rewritten snapshots never arrive and the app's stay at
format 9. No `migration.sql` changes: production databases apply nothing new. The compiler does not see a raw query
that treats a time column as a string.

## Run

No script: manual.

## Manual steps

1. From the repo root run `pnpm --filter backend exec tsx node_modules/drizzle-kit/bin.js up --config drizzle.config.ts`: each `snapshot.json` gets `"version": "10"` and loses its `"concurrently": false` keys.
2. In the app's own modules, find each `.execute(` whose rows hold a time column: type it `Date`, and convert where code compares, slices, parses with `z.string()` or sends it (`.toISOString()`).
3. An app script that runs `node_modules/drizzle-kit/bin.cjs` runs `bin.js`.
4. Caught by the compiler: a subquery selected as a field is typed `| null`, and `.concurrently()` on an index and the query cache (`$withCache`, the `cache` option) are gone.

## Verify

`pnpm generate` answers "No schema changes, nothing to migrate" unless the app has schema changes of its own waiting.
Then run:

```sh
pnpm generate
pnpm check
pnpm test
```
