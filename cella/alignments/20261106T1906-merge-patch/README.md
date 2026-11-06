---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: mergeJsonbShallow, mergeRestrictions, RestrictionsPatch, ::jsonb, .partial()
---

# Updates merge object fields as RFC 7396 merge patches

An update's object field (`organizationFlags`, `setupConfig`, `toolsConfig`, the tenant's `restrictions`, `userFlags`)
now merges member by member, and a `null` inside removes that member. An app's own `PATCH` route with a jsonb object
field takes `mergePatchSchema(<schema>)` in its body and writes `applyMergePatch(row.<field>, patch)` from a row it
read `forUpdate` in the update's transaction; `mergeJsonbShallow` and `mergeRestrictions` are gone, and
`getValidChannel` takes `{ bySlug, forUpdate }` as its fifth argument.

## What & why

Every `PATCH` except a product update is documented as `application/merge-patch+json`, but jsonb fields merged with a
shallow `||`: a nested object replaced the stored one and a `null` inside was stored. `applyMergePatch`
(`backend/src/utils/merge-patch.ts`) merges recursively, `mergePatchSchema` (`backend/src/schemas/merge-patch-schema.ts`)
gives a body field nullable members, and the merge starts from a locked row, so concurrent patches keep each other's keys.

## Blast radius

Apps with their own `PATCH` routes that take a jsonb object, and apps that call `getValidChannel` with a slug,
`mergeJsonbShallow` or `mergeRestrictions`. A client that sends one member of a `toolsConfig` slot keeps the other.
No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. Where an app passes `bySlug` to `getValidChannel` as its fifth argument, pass `{ bySlug }`.
2. Replace `mergeJsonbShallow(column, value)` in an app's update query: read the row inside the update's transaction with `getValidChannel(..., { forUpdate: true })` or `getValidProduct(..., { forUpdate: true })` and write `applyMergePatch(row.<field>, patch.<field>)`.
3. Give each jsonb object field of an app's update body `mergePatchSchema(<its schema>)` in place of `.partial()`; a field that is one whole value says so in its `.describe()`.
4. Replace `mergeRestrictions(base, patch)` with `applyMergePatch(base, patch)`.

## Verify

```sh
pnpm sdk
pnpm --filter backend test
pnpm check
```

Send a nested patch to each of the app's own `PATCH` routes with an object field: a sibling member stays and `null` removes one.
