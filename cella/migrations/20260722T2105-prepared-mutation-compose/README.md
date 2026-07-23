# Compose prepared mutations over useMutation (drop usePreparedMutation)

## What & why

The offline mutation template dropped the `usePreparedMutation` hook wrapper in
[`frontend/src/query/offline/prepared-mutation.ts`](../../../frontend/src/query/offline/prepared-mutation.ts).
It hid `useMutation` behind a five-generic hook signature that every call site had to spell out. The
reusable core, `buildPreparedHandlers(mutation, prepare)` (pure, unit-tested), stays. Each mutation
hook now calls `useMutation` directly and spreads the prepared handlers over it:

```ts
const mutation = useMutation(options);
return { ...mutation, ...buildPreparedHandlers(mutation, prepare) };
```

This keeps react-query first-class at the call site, collapses the five explicit generics to three
that infer, and removes the `mutation as Mutatable` cast (the `Mutatable` interface now uses method
syntax so a `UseMutationResult` is assignable without it). `PreparedVars`, the `COALESCED` sentinel,
and `buildPreparedHandlers` are unchanged and still exported, so callers that await a create and
narrow against `COALESCED` keep working untouched.

## Blast radius

Fork-breaking, frontend only. Any fork mutation hook that imports `usePreparedMutation` breaks at
compile time (`pnpm check` catches every site). In a stock cella fork these are the per-entity
`query.ts` files that drive offline create/update/delete (e.g. `attachment`, and in a task-style
fork also `label` and `task`). The `prepare` functions themselves, the squash/coalesce logic, and
the `COALESCED` call sites do not change.

No wire-shape change, so no `clientCacheVersion` bump and no lens. No database change. A fork that
never wrote a mutation hook on top of `usePreparedMutation` (only consumed the entity hooks) is
unaffected beyond pulling the upstream files.

## Run

No script -- manual. The rewrite restructures each hook (introduce a `useMutation` local, replace
the `return`, annotate the inline `prepare` input type so `TInput` infers) and cannot be done by a
safe word-boundary codemod. Call sites are few (one block per mutation hook).

## Manual steps

1. Find every fork call site (upstream files arrive already migrated):

   ```sh
   grep -rn "usePreparedMutation" frontend/src --include=*.ts --include=*.tsx
   ```

2. In each `query.ts` that matched, fix the imports:

   - Add `useMutation` to the `@tanstack/react-query` import.
   - Change the prepared-mutation import from `usePreparedMutation` to `buildPreparedHandlers`,
     keeping `PreparedVars` (and `COALESCED` if the module already imported it):

     ```ts
     import { buildPreparedHandlers, type PreparedVars } from '~/query/offline/prepared-mutation';
     ```

3. Rewrite each hook. Drop the five generics; build the mutation with `useMutation`, then spread the
   prepared handlers. For a create (inline `prepare`, annotate its input so `TInput` infers):

   ```ts
   // before
   return usePreparedMutation<CreateData, Error, CreateVars, Ctx, CreateInput>(
     createOptions(queryClient),
     (data) => ({ kind: 'run', vars: { tenantId, organizationId, data, stx: createStxForCreate() } }),
   );

   // after
   const mutation = useMutation(createOptions(queryClient));
   const prepare = (data: CreateInput): PreparedVars<CreateVars> => ({
     kind: 'run',
     vars: { tenantId, organizationId, data, stx: createStxForCreate() },
   });
   return { ...mutation, ...buildPreparedHandlers(mutation, prepare) };
   ```

   For update/delete, the `prepare` const is already annotated (`(input): PreparedVars<Vars> => …`);
   leave its body as is and only swap the return:

   ```ts
   // before
   return usePreparedMutation<UpdateData, Error, UpdateVars, Ctx, UpdateInput>(
     updateOptions(queryClient),
     prepare,
   );

   // after
   const mutation = useMutation(updateOptions(queryClient));
   // ... existing const prepare = (...) => { ... } ...
   return { ...mutation, ...buildPreparedHandlers(mutation, prepare) };
   ```

4. Leave `COALESCED` call sites unchanged. `mutateAsync` still resolves to `TData | typeof
   COALESCED`, so `createdEntity !== COALESCED` guards keep narrowing correctly.

## Verify

```sh
pnpm check     # typecheck flags any remaining usePreparedMutation reference or missed generic
```
