# Role vocabulary derived from the hierarchy

## What & why

cella used to write its own role name `member` as a literal in tests, fixtures, stories, email
previews, the `memberships` and `inactive_memberships` column defaults and the invite form's
default role. An app whose role registry has no `member` (projectcampus: `admin | staff | guest`)
failed type-check on every one of those files after each sync and carried a `// fork: role
vocabulary` line in 17 files. The hierarchy now exposes the vocabulary: `hierarchy.rootChannelType`
(the parentless channel), `hierarchy.getLeastPrivilegedRole(channelType)` (the last declared role,
the vocabulary's floor) and `hierarchy.getMostPrivilegedRole(channelType)`. cella's own code reads
those instead of `'member'`; the membership column default and the invite default follow the app's
registry.

## Blast radius

Not sync-breaking by itself: every changed file resolves to the same value an app with a `member`
floor already had. Apps that replaced `'member'` locally get a clean merge where their change
matches, and a trivial conflict where the fork line differs; take upstream. No wire-shape change.
The membership column default is now computed from the registry: for an app whose floor differs
from what its DB default holds, `pnpm generate` emits a default-only migration (harmless; apps that
already changed the default see no diff).

## Run

No script — manual.

## Manual steps

1. Take upstream for every file that carried a `// fork: role vocabulary` marker and delete the
   marker. `grep -rn "fork: role vocabulary" backend frontend shared` must come back empty.
2. Fork-local tests that hardcode the app's own role names keep them; prefer
   `hierarchy.getLeastPrivilegedRole(hierarchy.rootChannelType)` when the test is about "any
   member", so a later vocabulary change does not touch it.
3. Where fork code derived the root channel itself
   (`hierarchy.channelTypes.find((t) => hierarchy.getParent(t) === null)`), use
   `hierarchy.rootChannelType`.

## Verify

```sh
pnpm generate
pnpm check
pnpm test:core
```
