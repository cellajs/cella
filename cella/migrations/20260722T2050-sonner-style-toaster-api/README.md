# Adopt the Sonner-style toaster API

## What & why

`toaster` follows Sonner's callable API: positional `toaster(message, severity, options)` becomes
`toaster.success(message, options)`, `toaster.info(...)`, `toaster.warning(...)`, or
`toaster.error(...)`; `toaster(message, options)` stays for default toasts. The wrapper also exposes
Sonner's `loading`, `message`, `promise`, `custom`, `dismiss`, `getHistory`, and `getToasts`, accepts
Sonner's full options type, and returns toast ids. String messages without `options.id` get a stable
Cella id (a repeated message updates one toast); pass your own id for a distinct identity.

## Blast radius

Sync-breaking for frontend code passing severity as the second positional argument; the codemod
rewrites literal severities and reports dynamic ones. Apps without custom toaster calls are
unaffected. No database, OpenAPI, SDK, or wire-shape change; no `clientCacheVersion` bump or lens.

## Run

Inventory, then rewrite:

```sh
pnpm exec tsx cella/migrations/20260722T2050-sonner-style-toaster-api/sonner-style-toaster-api.ts inventory frontend/src
pnpm exec tsx cella/migrations/20260722T2050-sonner-style-toaster-api/sonner-style-toaster-api.ts rewrite   frontend/src
```

For a `toaster` imported from another module path, add the repeatable `--module` flag:

```sh
pnpm exec tsx cella/migrations/20260722T2050-sonner-style-toaster-api/sonner-style-toaster-api.ts rewrite frontend/src --module "~/app/toaster"
```

## Manual steps

1. Resolve every call reported as a dynamic second argument. Value restricted to
   `success | error | info | warning`:

   ```ts
   toaster[severity](message, options);
   ```

   Value that can also be `default`:

   ```ts
   if (severity === 'default') toaster(message, options);
   else toaster[severity](message, options);
   ```

2. Review direct `toast` imports from `sonner` (not rewritten). Notifications needing Cella's
   duplicate-message policy import `toaster` from `~/modules/common/toaster/toaster`.
3. Review calls skipped because the imported binding is shadowed: rename the nested binding and
   rerun the codemod, or update the call by hand.

## Verify

The second inventory must report zero rewrites and no skipped legacy calls:

```sh
pnpm exec tsx cella/migrations/20260722T2050-sonner-style-toaster-api/sonner-style-toaster-api.test.ts
pnpm exec tsx cella/migrations/20260722T2050-sonner-style-toaster-api/sonner-style-toaster-api.ts inventory frontend/src
pnpm check
```
