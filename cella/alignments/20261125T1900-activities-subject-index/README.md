---
breaking: false
clientCacheBump: false
generate: true
---

# The activities subject index holds the subject

Run `pnpm generate` after the upgrade. The app's new migration drops `activities_entity_type_subject_id_index` and
creates it again on `(entity_type, subject_id)`.

## What & why

`activities_entity_type_subject_id_index` in `activities-db.ts` was declared on `(entity_type, id)`, so no index of
`activities` held `subject_id`, and a read of one subject's activities scanned every weekly partition. The index now
holds the two columns its name states.

## Blast radius

Every app's database: `backend/drizzle` is app-owned, so the template's migration never arrives. No code, wire, cache or
lens change. An app that added its own index on `activities.subject_id` can compare it with this one.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate` (with the hints of any other schema alignment you apply in the same run) and commit the new `backend/drizzle` folder: one `DROP INDEX` and one `CREATE INDEX`.

## Verify

```sh
pnpm generate
pnpm check
```
