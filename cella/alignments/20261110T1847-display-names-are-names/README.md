---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: displayName, display_name, subjectTitle
generate: true
---

# An institution, a federation and a notification subject carry a name

`connections.displayName` is `name`, and `pnpm generate` with this folder's `hints.json` renames its column. A federation
in `appConfig.federations` takes `name` where it took `label`, and so does a federation a response names (`{ key, name }`).
An institution on the wire (`Connection`, `MeAuthData.institutions`, the SSO entry's `institution`) carries `name`, and a
notification's `subjectTitle` is `subjectName`, in `SubjectEmailRecipient` and `param('subjectName')` too.

## What & why

One display name was `displayName`, `label` or `title` by where it sat, beside `channelName` and `organizationName`. A
name is now `name`, or `<thing>Name` beside other names. The institution's name is still the one the federation's
metadata lists.

## Blast radius

Every app: `backend/drizzle` is app-owned. The typecheck names each typed read, a federation's `label` in the app's
config and each mail that builds `SubjectEmailRecipient`. Raw SQL, untyped test reads and outside API clients escape it.
`clientCacheVersion` moves.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261110T1847-display-names-are-names/hints.json)"`: it renames one column and nothing else.
2. In the app's `shared/config` files, rename `label` to `name` in each entry of `federations`.
3. Replace `displayName` with `name` on connections and institutions, `federation.label` with `federation.name`, and `subjectTitle` with `subjectName`, in app code, mail templates and tests.

## Verify

```sh
pnpm migrate
pnpm check
```
