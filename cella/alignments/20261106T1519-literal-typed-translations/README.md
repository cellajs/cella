---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: enCommonExtended, merge: { target, resources.gen
---

# Translations type as their English text

`t('c:accept')` now types as `"Accept"` in the frontend and the backend, from `locales/resources.gen.d.ts`, which the
frontend's locales plugin writes at every dev start and build. Add that file to `overrides.ignored` and generate it
once. `locales/namespaces.json` holds the rule that `c` is `common.json` with `app.json` over it, read through
`toRuntimeNamespaces` and `localeFilesOf` in `shared/utils/locale-namespaces`. Biome sorts the keys of every locale file.

## What & why

The texts show on hover in any editor, and `pnpm cella i18n` checks the translations. Backend `t()` is typed for the
first time, so a key built from a `string` no longer compiles. A variable that holds one text and is assigned another
needs `string` as its type. The merge rule had four copies; the frontend, the backend, the types and the CLI now read
`locales/namespaces.json`.

## Blast radius

Every app. No wire, cache or schema change. The typecheck finds each site. An app whose own code never stores a
`t()` result in a reassigned variable or builds a backend key from a `string` only adds the ignored entry and
generates the file.

## Run

No script: manual.

## Manual steps

1. Add `'locales/resources.gen.d.ts'` to `overrides.ignored` in `cella/cella.config.ts`: each app generates its own.
2. Run `pnpm dev` once, or `pnpm --filter frontend build`, and commit the generated `locales/resources.gen.d.ts`.
3. Type a reassigned variable that holds `t()` as `string`: `let text: string = t('c:...')`.
4. Give a backend `t()` with a built key a key type, a `defaultValue`, or `as const` on its `ns` option.
5. Route a language the app added in `backend/src/lib/i18n-locales.ts` through `toRuntimeNamespaces`, as `en` does.
6. Run `pnpm lint:fix`: it sorts the keys of `app.json`, `about.json` and every other locale file.

## Verify

`pnpm cella i18n` reports no orphans or mismatches the app did not have before.

```sh
pnpm check
```
