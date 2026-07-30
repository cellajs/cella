# backend

Hono-based API server with PostgreSQL (Drizzle ORM). Handles authentication, entity CRUD, file uploads, real-time sync, and all server-side business logic. Runs as part of `pnpm dev`.

## Query module conventions

Database access for a module belongs in `<module>-queries.ts`. Operations and handlers assemble
authorization and request-specific filters, then call these query functions. Keep business rules,
HTTP response shaping, notifications, and cache invalidation outside query modules.

Use these conventions when adding or changing a query:

- Accept `ctx` as the first argument. Read database and scope values from `ctx.var` inside the
  function so the context boundary stays visible.
- Accept one options object as the second argument when inputs are needed. Declare a named
  `<FunctionName>Opts` interface next to the function. Do not use positional arguments or an inline
  object type.
- Use names that describe the returned value: `find*` for rows, `count*` for aggregate counts,
  `get*` for computed values or projections, and `insert*`, `update*`, or `delete*` for writes.
  Reserve `build*Query` for a query builder that a caller must intentionally extend.
- Put a lookup in the module that owns the returned data. Reuse that query across auth, system, and
  other consumers; do not copy the same join into multiple query modules.
- Scope tenant or organization writes in the SQL predicate, even when a guard or RLS policy already
  checked access. Return only the fields the caller needs for post-write verification.

Paginated queries own their filters, ordering, limit, offset, and total strategy. Name them
`find<Entity>Paginated` and return `PaginatedResult<T>` as `{ items, total }` through
`resolveListTotal`:

- Use `pageLength` when a delta page does not expose a collection total.
- Use `counter` only when an eligible precomputed counter exactly matches the requested scope.
- Use `exact` for filtered or otherwise narrower collections.

Run item and total reads through `resolveListTotal` so independent reads execute concurrently.
Every offset-paginated query must use `getOrderColumns` with a `[sort, direction]` fallback,
allowlisted columns, and a unique tie-breaker. Use `pick(table, keys)` for direct table-column
allowlists and an explicit map for aliases, joins, or SQL expressions. Use `append` for fixed
trailing order expressions. API schemas should keep defaulted sort and order fields optional on
input; the query helper applies the effective fallback.

When a query defect affects behavior, add a focused regression test beside the query or in
`backend/tests`. Database uniqueness requirements still need a schema constraint and generated
migration; an application lookup alone is not concurrency-safe.
