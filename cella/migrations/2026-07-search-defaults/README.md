# List search defaults out of the URL

Every list route now declares its default view once and keeps it out of the
URL: zod `.default()` on `validateSearch` rehydrates the defaults on read, and
a `stripSearchParams` middleware removes any param equal to its default on
write. Landing on a table gives you a bare `/system/users` instead of
`/system/users?sort=createdAt&order=desc`.

The same sweep removed the `defaultValues` option from `useSearchParams` —
**the one fork-breaking part**. Manual, no script: picking a route's defaults
needs per-module judgement about which params are defaults and which are
filters.

## Why the URL was clogged

The SDK's generated query schemas carry defaults:

```ts
// sdk/gen/zod.gen.ts
sort: z.enum([...]).optional().default('createdAt'),
order: z.enum(['asc', 'desc']).optional().default('desc'),
```

Route schemas `.pick()` those fields, and `.pick()` preserves `.default()`. So
`validateSearch` injects `sort`/`order` even when the URL omits them, and the
router writes them back — you land on `?sort=createdAt&order=desc` without
touching anything. `stripSearchParams(defaults)` removes params that deep-equal
their default, so absence means default. The two halves are a matched pair:
zod re-hydrates on read, the middleware strips on write. Sort indicators and
query fallbacks keep working because the value is still there in the parsed
search — it just isn't in the URL.

## What changed upstream

- **`useSearchParams` no longer accepts `defaultValues`**
  (`frontend/src/hooks/use-search-params.tsx`). The option, its merge, its
  empty-value reset branch, and its mount effect are gone. That effect
  navigated to *add* defaults to the URL — the exact inverse of
  `stripSearchParams`, and the two would have fought. `SearchParams` also
  dropped its generic (`defaultValues?: Partial<T>` was `T`'s only consumer);
  `useSearchParams<MySearch>({ from: … })` is unaffected.
- **Each list module exports a `<name>SearchDefaults` const** from its
  `search-params-schemas.ts`, used by three call sites: the route's strip
  middleware, the `query.ts` fallbacks, and (for attachments) default-view
  detection via `isDefaultListView`.
- **Six routes gained `search: { middlewares: [stripSearchParams(...)] }`**:
  attachments, members, organizations, requests, tenants, users.
- **Export bars pass `sort`/`order` straight through.** The
  `sort: sort || 'createdAt'` fallbacks in `*-bar.tsx` were dead (the table
  always supplies zod-validated search) and organizations' copy was *wrong* —
  `createdAt`, where the real default is `displayOrder`. `fetchXForExport`
  defaults from the const instead.
- **New `frontend/src/modules/list-search-defaults.test.ts`** asserts every
  defaults const against `schema.parse({})`.

## What forks must do

1. **Drop `defaultValues` from `useSearchParams` call sites.** This is the only
   thing that fails to compile. Find them:

   ```sh
   grep -rn "defaultValues" frontend/src --include=*.tsx | grep -i searchparams
   ```

   Replace it with the schema + middleware pair below. If a fork used
   `defaultValues` purely to seed a table's sort, the zod `.default()` your SDK
   already generates covers it — delete and move on.

2. **Adopt the pattern on fork list routes.** Any route whose schema `.pick()`s
   from a generated `zGet*Query` has this clogging today. Find candidates:

   ```sh
   grep -rln "validateSearch" frontend/src/routes
   grep -rn "\.pick(" frontend/src/modules/*/search-params-schemas.ts
   ```

   For each, add the const and wire the middleware:

   ```ts
   // frontend/src/modules/<mod>/search-params-schemas.ts
   export const tasksSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

   // frontend/src/routes/.../tasks.tsx
   validateSearch: tasksRouteSearchParamsSchema,
   // Absence means default: params equal to the default view are stripped from the URL
   search: { middlewares: [stripSearchParams(tasksSearchDefaults)] },
   ```

   **Read each default off your own generated schema — do not copy-paste this
   snippet.** Defaults are per-endpoint: cella's organizations list defaults to
   `displayOrder`/`asc`, not `createdAt`/`desc`. A defaults object that doesn't
   match the schema silently does nothing (stripping never fires) or strips a
   value that isn't the default. Check yours:

   ```sh
   grep -A4 "zGetTasksQuery = " sdk/gen/zod.gen.ts
   ```

   Include `q: ''` even though `q` has no schema default — that's what a cleared
   search box produces, and stripping it keeps `?q=` out of the URL. Leave real
   filters (`role`, `status`, sheet/dialog ids) out of the defaults object.

3. **Point `query.ts` fallbacks at the const** instead of repeating literals, so
   the strip object and the query defaults can't drift apart:

   ```ts
   q = tasksSearchDefaults.q,
   sort = tasksSearchDefaults.sort,
   order = tasksSearchDefaults.order,
   ```

   Keep any *derived* default as-is — cella's organizations query keeps
   `order = sort === 'displayOrder' ? 'asc' : 'desc'`, because that rule is
   about the column, not about which sort happens to be the default. These
   fallbacks are load-bearing: `useSearchParams({ saveDataInSearch: false })`
   (sheets, grids) returns `{}` with no zod defaults at all.

4. **Add fork modules to the drift test** in
   `frontend/src/modules/list-search-defaults.test.ts` — one `cases` entry per
   module. When a backend default changes and the SDK regenerates, the test
   fails instead of stripping quietly going dead.

## Don't confuse the two strip helpers

`~/utils/strip-search-params`'s `stripParams(...keys)` is a different tool and
stays. It removes keys belonging to *other* routes that ride along on
`search: (prev) => ({ ...prev })` links; `validateSearch` drops those from the
parsed object but leaves them in the URL. TanStack's `stripSearchParams` can't
express them — its array form is typed to `keyof TOptionalProps`, so it only
names keys the route's own schema declares.

## Gates

```sh
pnpm exec biome check --write .
pnpm ts
pnpm --filter frontend test
```

`pnpm ts` catches every `defaultValues` call site. The drift test catches a
defaults const that disagrees with its schema. Neither catches a route you
simply forgot — for that, load each list route and confirm the URL is bare on
arrival, the sort indicator still shows, and a non-default sort still appears.
