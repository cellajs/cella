# Role vocabulary derived from the hierarchy

## What & why

cella wrote `member` as a literal in tests, fixtures, stories, email previews, the `memberships`
and `inactive_memberships` column defaults and the invite default role, so apps with another
vocabulary (projectcampus: `admin | staff | guest`) carried `// fork: role vocabulary` in 17
files. The hierarchy now exposes
`hierarchy.rootChannelType` (the parentless channel), `hierarchy.getLeastPrivilegedRole(channelType)`
(the last declared role, the floor) and `hierarchy.getMostPrivilegedRole(channelType)`; the column
default and invite default follow the app's registry.

## Blast radius

Not sync-breaking: every changed file resolves to the same value for an app with a `member` floor;
apps that replaced `'member'` locally get at most a trivial conflict (take upstream). No wire
change. If the registry floor differs from the DB default, `pnpm generate` emits a harmless
default-only migration.

## Run

No script: manual.

## Manual steps

1. Take upstream for every file with a `// fork: role vocabulary` marker and delete the marker;
   `grep -rn "fork: role vocabulary" backend frontend shared` must come back empty.
2. Fork-local tests keep hardcoded app role names; prefer
   `hierarchy.getLeastPrivilegedRole(hierarchy.rootChannelType)` when the test means "any member".
3. Replace fork code deriving the root itself
   (`hierarchy.channelTypes.find((t) => hierarchy.getParent(t) === null)`) with
   `hierarchy.rootChannelType`.

## Verify

```sh
pnpm generate
pnpm check
pnpm test:core
```
