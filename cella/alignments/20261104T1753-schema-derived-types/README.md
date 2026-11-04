---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: 'asc' | 'desc', ProductBase, RoleBinding, Restrictions
---

# Response examples are typed by their schema, and list sort types come from the list schemas

`json(description, schema, example)` types `example` as the schema's output, so an app's response example that drifted
from its schema fails to compile. A channel response mock typed as its db model (`XModel & { included: ... }`) carries
raw writer ids: it spreads `mockActorRefs(base, key)` without the model annotation, as `mockOrganizationResponse` does.
An app's query options may take `sort` and `order` from their list schema in place of the `'asc' | 'desc'` copies (raak:
project, workspace and label queries; projectcampus: course, course section, item, material, comment, label and project
queries).

## What & why

`json()` took `example?: unknown`, so an example compiled whatever its shape and shipped in the docs; five template
examples failed once typed, each on a mock type wider than its value. Hand-written types gave way to their Zod schemas:
`orderSchema` and `OrderDirection`, `RoleBinding` in `service-accounts-schema`, `Restrictions` and `RestrictionsPatch`
in `tenants-schema`, `ConnectionConfig`. `ProductBase` left the spec and the SDK, and `Tenant.restrictions.quotas` lists
one integer per quota key.

## Blast radius

Apps whose own route examples drifted, mostly channel response mocks typed by their db model; the compiler names each.
An import of `RoleBinding`, `Restrictions` or `ProductBase` from its old place fails to compile (none in raak or
projectcampus). No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Fix each example `pnpm check` flags. A channel response mock annotated `XModel & { included: ... }` drops the annotation and spreads `...mockActorRefs(base, key)` after its base; a literal typed as a string (`variant: 'thumbnail'`) takes `as const`; a keyed record built with `Object.fromEntries` uses `recordFromKeys`.
2. Optional: a `*-queries.ts` options interface `extends Pick<z.infer<typeof xListQuerySchema>, 'sort' | 'order'>` in place of its `sort` and `order` lines, the schema imported with `import type`; a list schema with an order default of its own writes `orderSchema.default(...)` from `#/schemas`.
3. Import `RoleBinding` from `#/modules/service-accounts/service-accounts-schema` and `Restrictions` from `#/modules/tenants/tenants-schema`.

## Verify

```sh
pnpm check
```
