# Public read is a flag, not a mode

## What & why

`PublicReadMode` (the single-member `'publicSelf'` union nothing branched on) is deleted from
`shared/src/permissions/public-read.ts` and both barrels (`shared/src/permissions/index.ts`,
`shared/index.ts`). `PublicReadGrants` is `Partial<Record<ChannelEntityType | ProductEntityType, true>>`,
the config builder's `publicRead()` takes no argument, `GrantSource`'s public variant is
`{ type: 'public' }`, and `formatGrant` prints `public`. Decision logic is untouched (the shared
`'public'` row condition over `publicAt`); a second actor-independent read flavour is a new
`RowConditionName` (`matchesRowCondition` case + SQL twin), not a mode string.

## Blast radius

Sync-breaking at the type level, only for apps using public read. No wire-shape change, no
`clientCacheVersion` bump, no database change (`publicAt` columns untouched). Affected if the app
calls `publicRead('publicSelf')` in `shared/config/permissions-config.ts`, imports `PublicReadMode`,
hand-builds a `PublicReadGrants` literal, or asserts on `{ type: 'public', mode: … }`.

## Run

No script; find every site:

```sh
grep -rn "publicSelf\|PublicReadMode" --include="*.ts" --include="*.tsx" --include="*.md" .
```

## Manual steps

1. `shared/config/permissions-config.ts`: `publicRead('publicSelf')` -> `publicRead()`.
2. Drop `PublicReadMode` imports; hand-built grant map values become `true`
   (`{ attachment: 'publicSelf' }` -> `{ attachment: true }`).
3. Test assertions: `{ type: 'public', mode: 'publicSelf' }` -> `{ type: 'public' }`; debug snapshots
   containing `public:publicSelf` become `public`.
4. App docs showing the call site (upstream updated `cella/PERMISSIONS.md` and `cella/ADD_ENTITY.md`).

## Verify

```sh
pnpm check
pnpm test --filter shared
```
