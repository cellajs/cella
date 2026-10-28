# Alignments

When an upstream cella change rewrites a pattern across the codebase (a codemod sweep, a schema
shift, a renamed contract, a change in behavior), upstream code arrives already changed but
app-specific code still follows the old pattern. Each folder here is an alignment: it tells an app
how to bring its own code in line with one such change after a sync. Alignments stay in this repo:
the sync never copies this folder into an app, and apps read them with `pnpm cella align`.

## How it is structured

- **One folder per alignment**, named `<YYYYMMDDThhmm>-<slug>` (UTC, minute precision). The
  timestamp is the stable id and sort key; a date alone collides under high merge activity. Each
  folder holds a `README.md` (from [_TEMPLATE.md](./_TEMPLATE.md)) and whatever the change needs
  (codemod script, data files, SQL).
- **The README describes the alignment.** Its frontmatter says how far the change reaches and how
  an app finds its leftovers; the title and the paragraph under it are the summary. The codemod is
  the one non-test `.ts` file in the folder. There is no central index, so two PRs that each add
  an alignment never conflict. `pnpm style` checks the shape.

### Frontmatter

| Key | Value | Required |
|---|---|---|
| `syncBreaking` | `true` when app-specific code has to follow, `false` when an app that copied nothing gets the change for free | always |
| `clientCacheBump` | `true` when upstream bumped `clientCacheVersion` or shipped a lens, so an app that sets its own bumps it too | always |
| `caughtBy` | `compiler` (typecheck flags every app site), `tests` (a test the app inherits fails), `nothing` (a behavior change only reading the app's code finds) | when `syncBreaking: true` |
| `grep` | comma-separated identifiers, wire fields or config keys that app code may still use | no |
| `generate` | `true` when the change needs `pnpm generate` | no |
| `roots` | the codemod's default scan roots | beside a codemod |

Besides what the frontmatter says, `pnpm cella align` reads from git which PR added each
alignment, which other alignments that PR carried, and which of its files the app pins, ignores or
changed. It searches the app's own and changed files for the `grep` terms; files identical to
upstream never count.

## For apps: aligning after a sync

The sync records the alignments that arrive with it in the app-owned `cella/cella.alignments.json`, and every sync run
ends with a line such as `alignments: 94 of 97 handled · 3 open: pnpm cella align`. They are information, not a gate:
they stay listed until recorded. The [align skill](../skills/align/SKILL.md) works through them and reports each
outcome in the sync PR, which is how upstream learns which alignments were precise.

## For maintainers: authoring an alignment

Ship the alignment in the same PR as the breaking change:

1. Create `cella/alignments/<YYYYMMDDThhmm>-<slug>/README.md` from [_TEMPLATE.md](./_TEMPLATE.md)
   (`date -u +%Y%m%dT%H%M` for the prefix) plus the codemod / SQL / data files it needs. Nothing
   else to register.
2. Say how an app finds its leftovers. A rename the compiler flags is `caughtBy: compiler` and
   needs no `grep`. A behavior change is `caughtBy: nothing` and lists in `grep` what an app's own
   queries, parsers or tests would name: a table they join, a schema they parse, a config key.
3. Keep codemods entity-agnostic and driven by allow-lists or explicit maps, so apps extend them
   via a flag (e.g. `--extra-renames`) without editing the shipped script. Apps run the codemod
   from an extracted copy, so it must not import from other folders of this repo.
4. A schema change sets `generate: true` and ships what a combined generate needs: `hints.json`,
   the `--hints` array that answers drizzle's rename-or-create questions (a `create` hint for every
   new table or column in a diff that also drops one), and `data.sql`, the hand-written
   statements, each under a comment that says where it goes in the generated migration.
5. A change to an app-owned path that synced code reads from (a pinned file, `logo.tsx`,
   `backend/drizzle`) is a breaking change for apps even when nothing else moves: the app's copy
   never updates. `pnpm style` asks for the alignment; `Alignment: none, <reason>` in a commit
   message answers it when apps have nothing to do.
6. A reference module (attachment, organization) that starts to call a shared helper another way
   gets a `syncBreaking: false` alignment too: apps copied the old call into their own modules.

A `syncBreaking: true` change without an alignment is what this system exists to prevent; treat it
like a missing `clientCacheVersion` bump.
