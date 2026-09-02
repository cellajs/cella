# Compose prepared mutations over useMutation (drop usePreparedMutation)

## What & why

`usePreparedMutation` is removed from
[`frontend/src/query/offline/prepared-mutation.ts`](../../../frontend/src/query/offline/prepared-mutation.ts);
it hid `useMutation` behind five explicit generics. `buildPreparedHandlers(mutation, prepare)`
stays; hooks call `useMutation` and spread the handlers:

```ts
const mutation = useMutation(options);
return { ...mutation, ...buildPreparedHandlers(mutation, prepare) };
```

Three generics infer; the `mutation as Mutatable` cast is gone (`Mutatable` uses method syntax).
`PreparedVars`, `COALESCED`, and `buildPreparedHandlers` are unchanged and still exported.

## Blast radius

Sync-breaking, frontend only; `pnpm check` catches every site: app hooks importing
`usePreparedMutation` (per-entity `query.ts` offline create/update/delete, e.g. `attachment`;
`label` and `task` in a task-style app). `prepare` functions, squash/coalesce logic, and
`COALESCED` call sites are unchanged. No wire-shape, `clientCacheVersion`, lens, or database
change; apps that only consume the entity hooks are unaffected.

## Run

No script, manual (one block per hook).

## Manual steps

1. Find every app call site (upstream files arrive migrated):

   ```sh
   grep -rn "usePreparedMutation" frontend/src --include=*.ts --include=*.tsx
   ```

2. In each matching `query.ts`, add `useMutation` to the `@tanstack/react-query` import and swap
   `usePreparedMutation` for `buildPreparedHandlers`, keeping `PreparedVars` (and `COALESCED` if
   imported):

   ```ts
   import { buildPreparedHandlers, type PreparedVars } from '~/query/offline/prepared-mutation';
   ```

3. Rewrite each hook. Create (inline `prepare`, annotate its input):

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

   Update/delete (`prepare` already annotated `(input): PreparedVars<Vars> => …`; swap only the
   return):

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

4. Leave `COALESCED` call sites unchanged: `mutateAsync` still resolves to `TData | typeof
   COALESCED`, so `createdEntity !== COALESCED` guards keep narrowing.

## Verify

```sh
pnpm check     # flags any remaining usePreparedMutation reference or missed generic
```
