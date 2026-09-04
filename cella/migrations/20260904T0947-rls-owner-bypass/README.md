# RLS owner bypass replaces BYPASSRLS: NO FORCE RLS, effective CDC role probe, smoke warnings

## What & why

The 0.10.0 smoke step failed on `cdc=unhealthy(role_missing_bypassrls)`: Scaleway's admin user has
REPLICATION but never BYPASSRLS, and only a superuser can grant it. `10-rls` now emits
`ENABLE ROW LEVEL SECURITY` + `NO FORCE ROW LEVEL SECURITY`, so `admin_role` bypasses as the table
owner on every provider; `99-verify` asserts enabled-not-forced. The CDC probe reports `rlsBypass` and
`rlsBlockedTables` (health reason `rls_bypass_missing`). Smoke results are `ok|warn|fail`; `infra
status` gains `live.components` on the shared `infra/lib/health-components.ts`.

## Blast radius

Touches the database (the combined side-effect migration re-emits and un-forces RLS on the next
deploy) and the cdc→backend health push field (`roleBypassRls` → `rlsBypass`). Not sync-breaking for
apps that never customized RLS, the CDC worker, smoke, or the status registry.

## Run

No script: manual.

## Manual steps

1. `pnpm generate` and commit the new `*_side_effects` folder (RLS block now enables and un-forces; verify asserts `rls-enabled-not-forced:<table>`).
2. Test global setup: create `admin_role` without `BYPASSRLS` and `ALTER ROLE admin_role NOBYPASSRLS` on an existing volume; the degraded-volume guard checks `relrowsecurity AND NOT relforcerowsecurity`.
3. Fork tests or health mappings reading `roleBypassRls` or the reason `role_missing_bypassrls` switch to `rlsBypass` / `rls_bypass_missing`; catalog assertions on `relforcerowsecurity = true` flip to `false`.
4. Fork smoke callers reading `SmokeResult.ok` read `status` (`'ok' | 'warn' | 'fail'`); `unhealthyComponents`, `formatComponentIssues` and `componentSeverity` import from `infra/lib/health-components.ts`.
5. A fork status registry test harness adds `components` to its facts map (see `registry.test.ts`).

## Verify

```sh
pnpm generate
pnpm --filter cdc test
pnpm --filter infra test
pnpm test:core
pnpm test:core:runtime
pnpm check
```
