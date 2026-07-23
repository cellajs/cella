# Adopt the Sonner-style toaster API

## What & why

Cella's wrapper now follows Sonner's callable API. Calls move from the positional
`toaster(message, severity, options)` contract to `toaster.success(message, options)`,
`toaster.info(...)`, `toaster.warning(...)`, or `toaster.error(...)`. The base
`toaster(message, options)` form remains available for default toasts. The wrapper also exposes
Sonner's `loading`, `message`, `promise`, `custom`, `dismiss`, `getHistory`, and `getToasts`
methods, accepts Sonner's complete options type, and returns toast ids.

String messages without an explicit `options.id` receive a stable Cella id. Repeating the same
message updates one active toast through Sonner's native id behavior. Callers can provide their own
id when they need a distinct identity or controlled updates.

## Blast radius

This is fork-breaking for frontend code that still passes severity as the second positional
argument. The codemod safely handles literal severities and reports dynamic severities for manual
review. Forks without custom toaster calls are unaffected because upstream call sites arrive
already migrated.

There is no database, OpenAPI, SDK, persisted entity, or wire-shape change. No
`clientCacheVersion` bump or schema lens is needed.

## Run

From the repository root, inspect the fork-specific work first and then apply it:

```sh
pnpm exec tsx cella/migrations/20260722T2050-sonner-style-toaster-api/sonner-style-toaster-api.ts inventory frontend/src
pnpm exec tsx cella/migrations/20260722T2050-sonner-style-toaster-api/sonner-style-toaster-api.ts rewrite   frontend/src
```

If a fork imports the same `toaster` export from another module path, add the repeatable module
flag:

```sh
pnpm exec tsx cella/migrations/20260722T2050-sonner-style-toaster-api/sonner-style-toaster-api.ts rewrite frontend/src --module "~/fork/toaster"
```

## Manual steps

1. Resolve every call reported as a dynamic second argument. When the value is restricted to
   `success | error | info | warning`, use indexed method access:

   ```ts
   toaster[severity](message, options);
   ```

   If the value can also be `default`, branch to the callable form:

   ```ts
   if (severity === 'default') toaster(message, options);
   else toaster[severity](message, options);
   ```

2. Review direct `toast` imports from `sonner`. They are not changed automatically because they
   may intentionally use dependency-specific behavior. App notifications that need Cella's
   duplicate-message policy should import `toaster` from
   `~/modules/common/toaster/toaster`.

3. Review any call skipped because the imported binding is shadowed. Rename the nested binding,
   then rerun the codemod, or update the intended wrapper call by hand.

## Verify

The second inventory must report zero rewrites and no skipped legacy calls:

```sh
pnpm exec tsx cella/migrations/20260722T2050-sonner-style-toaster-api/sonner-style-toaster-api.test.ts
pnpm exec tsx cella/migrations/20260722T2050-sonner-style-toaster-api/sonner-style-toaster-api.ts inventory frontend/src
pnpm check
```
