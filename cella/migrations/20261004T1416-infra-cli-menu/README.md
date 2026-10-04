---
syncBreaking: false
clientCacheBump: false
---

# The infra CLI menu is one list, and every action is a command

`pnpm infra` opens one menu of eight rows: the submenus Manage database, Manage keys & secrets and Stack
setup are gone, and every action also runs alone as `pnpm infra <action>`. A menu path in an app's own
runbook, or in an earlier migration note, maps to a command: Apply infra change is `pnpm infra apply`,
Preview is `preview`, Rotate keys is `rotate-keys`, Rotate passphrase is `rotate-passphrase`, Manage
runtime secrets is `secrets`, Open and Close public DB access are `db-open` and `db-close`, Seed
database is `db-seed`, Reset database is `db-reset`, Resume is `resume`, Unlock is `unlock`, Fetch admin
application key is `fetch-admin-key`, Store passphrase in keychain is `store-passphrase`, Refresh GeoIP
data is `geoip-refresh`, Teardown is `teardown`.

## What & why

The two-level menu put sixteen actions behind three submenus whose names did not predict their
content. The menu is now flat and grouped. A row that cannot run stays listed with the reason, Esc
steps back, an action returns to the menu, and Ctrl-C at a prompt exits cleanly.
`infra/lib/operator-actions.ts` holds every action's id, label and key; messages take the names from it.

## Blast radius

Operators of every app, and app-owned docs or scripts that name a menu path. Not sync-breaking: no
database, cache, stack, env or config name changes. An app that never wrote down a menu path has
nothing to do.

## Run

No script: manual.

## Manual steps

1. Replace menu paths in app-owned runbooks and scripts with the commands from the summary above.

## Verify

```sh
pnpm infra help
pnpm --filter infra test
pnpm check
```
