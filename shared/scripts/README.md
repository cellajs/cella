# shared/scripts

## check-lenses.ts

CI guard for the schema-evolution lens system (`shared/src/schema-evolution/`). Run via
`pnpm --filter shared lens:check`; exits 1 on any violation.

Checks:

1. **Append-only lint**: dated lens module files must never change after their first commit
   (frozen). `lens-list.ts`, `define.ts`, and `engine.ts` are exempt.
2. **Config-collision validator**: a lens delta must not touch frozen-envelope fields, CDC
   counter fields, or declared entity-embedding host columns.
3. **Lens purity lint**: dated lens modules must be pure (no `await`, no dynamic `import()`,
   no value-dependent dynamic key access).
4. **Contract completeness**: every configured product/context entity type must register
   through the `evolutionContract` factory in `backend/src/modules`, so an entity can never
   silently miss the lens seams (widening + normalize).

## wait-backend.ts

Waits for the backend health endpoint before proceeding.
Usage: `tsx shared/scripts/wait-backend.ts [-i interval] [-t timeout]`.
