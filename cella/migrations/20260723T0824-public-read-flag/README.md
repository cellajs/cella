# Public read is a flag, not a mode

## What & why

`PublicReadMode` was a single-member string union (`'publicSelf'`) that no consumer ever branched
on: every read site tested the grant for truthiness, and the value only survived as a label in
`GrantSource` debug output. Public read is a per-subject opt-in, so it is now expressed as one:

- `PublicReadMode` is deleted (removed from `shared/src/permissions/public-read.ts` and from both
  export barrels, `shared/src/permissions/index.ts` and `shared/index.ts`).
- `PublicReadGrants` is `Partial<Record<ChannelEntityType | ProductEntityType, true>>`.
- The config builder's `publicRead` takes no argument: `publicRead()`.
- `GrantSource`'s public variant is `{ type: 'public' }`, and `formatGrant` prints `public`.

The decision logic is untouched: the engine still resolves public reads through the shared
`'public'` row condition against the row's own `publicAt`, so JS, SQL, and stream dispatch stay in
lockstep and the parity test still covers them. If a second flavour of actor-independent read is
ever needed, it arrives as a new `RowConditionName` with a `matchesRowCondition` case and a SQL
twin, not as a second mode string.

## Blast radius

Fork-breaking at the type level only, and only for forks that use public read. No wire-shape
change, no `clientCacheVersion` bump, no database change (`publicAt` columns are untouched, and
entities that never declare `publicRead()` keep them dormant as before).

A fork is affected if it: calls `publicRead('publicSelf')` in `shared/config/permissions-config.ts`;
imports the `PublicReadMode` type; builds a `PublicReadGrants` literal by hand (tests, fixtures);
or asserts on `grantedBy` entries of `{ type: 'public', mode: … }`. A fork that never declares
public read has nothing to do.

## Run

No script. Manual, but each step is a single-token edit; these greps find every site.

```sh
grep -rn "publicSelf\|PublicReadMode" --include="*.ts" --include="*.tsx" --include="*.md" .
```

## Manual steps

1. `shared/config/permissions-config.ts`: `publicRead('publicSelf')` -> `publicRead()`.
2. Any `PublicReadMode` import: drop it. A hand-built grant map's value type becomes `true`
   (`{ attachment: 'publicSelf' }` -> `{ attachment: true }`).
3. Test assertions on public attribution: `{ type: 'public', mode: 'publicSelf' }` ->
   `{ type: 'public' }`. Debug-output snapshots that contain `public:publicSelf` become `public`.
4. Fork docs that show the call site (upstream updated `cella/PERMISSIONS.md` and
   `cella/ADD_ENTITY.md`).

## Verify

```sh
pnpm check
pnpm test --filter shared
```
