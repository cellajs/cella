# backend

Hono API server on PostgreSQL (Drizzle ORM): authentication, entity CRUD, file uploads, real-time sync, and all server-side business logic. Runs as part of `pnpm dev`.

## Query module conventions

Database access for a module lives in `<module>-queries.ts`. Operations and handlers assemble
authorization and request filters, then call these query functions. Business rules, HTTP response
shaping, notifications, and cache invalidation stay outside query modules.

When adding or changing a query:

- Accept `ctx` as the first argument and read database and scope values from `ctx.var` inside the
  function, so the context boundary stays visible.
- Accept one options object as the second argument, typed by a named `<FunctionName>Opts`
  interface next to the function. No positional arguments or inline object types.
- Name by returned value: `find*` for rows, `count*` for aggregates, `get*` for computed values or
  projections, `insert*` / `update*` / `delete*` for writes. Reserve `build*Query` for a builder a
  caller must extend.
- Put a lookup in the module that owns the returned data and reuse it from auth, system, and other
  consumers; never copy the same join into several query modules.
- Scope tenant or organization writes in the SQL predicate, even when a guard or RLS policy already
  checked access. Return only the fields the caller needs for post-write verification.

Paginated queries own their filters, ordering, limit, offset, and total strategy. Name them
`find<Entity>Paginated` and return `PaginatedResult<T>` as `{ items, total }` through
`resolveListTotal`, which runs item and total reads concurrently:

- `pageLength` when a delta page exposes no collection total.
- `counter` only when an eligible precomputed counter exactly matches the requested scope.
- `exact` for filtered or otherwise narrower collections.

Every offset-paginated query uses `getOrderColumns` with a `[sort, direction]` fallback,
allowlisted columns, and a unique tie-breaker. Use `pick(table, keys)` for direct table-column
allowlists and an explicit map for aliases, joins, or SQL expressions; `append` adds fixed trailing
order expressions. API schemas keep defaulted sort and order fields optional on input; the query
helper applies the fallback.

A query defect that affects behavior gets a focused regression test beside the query or in
`backend/tests`. Database uniqueness still needs a schema constraint and generated migration; an
application lookup alone is not concurrency-safe.
