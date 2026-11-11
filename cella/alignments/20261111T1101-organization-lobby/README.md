---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: you_are_role, noDirectAccess, home.text
---

# Organization lobby names the viewer's role

The lobby at `/$tenantId/$organizationSlug` reads `c:you_are_role.<role>` for each organization role. An app whose
organization has roles beyond admin and member adds a `you_are_role.<role>` key per role to its `app.json`. App routes
that import `noDirectAccess` from `~/utils/no-direct-access` drop the call.

## What & why

With organization buttons on the rail (`navigation.menu: 'perOrganization'`), a press on an organization while a page
of another organization is open, or a pick in the phone switcher there, now opens that organization's lobby behind its
menu sheet. The old page stayed behind the sheet of a different organization. On a page outside every organization,
the press opens the menu sheet alone. The bare organization URL renders the lobby, so `noDirectAccess` lost its last
caller and is removed. The `c:home.text` key is gone with the home page's subtitle.

## Blast radius

Apps with their own organization roles fail typecheck until the keys exist. Apps that link to the bare organization URL
now land on the lobby, not on `/organization`. No database, wire, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In `locales/en/app.json`, add `"you_are_role.<role>": "You are a <role>"` for each organization role outside admin and member.
2. Remove `noDirectAccess(...)` calls and imports from app route files.
3. Drop a `home.text` override from `app.json`.

## Verify

```sh
pnpm check
```
