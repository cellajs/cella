---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: react-compiler-allowlist, use no memo
---

# A production build fails on a function the React Compiler skips

`pnpm --filter frontend build` now fails on every component or hook the React Compiler skips that no allowlist
names, and prints each one as `<file>:<function>` with the compiler's reason and line. The template's entries arrive
in `frontend/vite/react-compiler-allowlist.json`. An app lists its own in `frontend/vite/react-compiler-allowlist.app.json`,
an app-owned path: add it to `overrides.ignored` in `cella/cella.config.ts`, then fix or list what the build prints.

## What & why

The compiler skipped a function that broke a rule of React and told no one: the function ran without memoization, and
refs read during render went unnoticed until a bug. `reactCompilerPreset({ logger })` in `vite.config.ts` now
reports each skip to `react-compiler-guard.ts`, which fails the build on an unlisted one and warns in dev. An entry
that compiles again only warns.

## Blast radius

Breaking for an app with skipped functions in its own files, or in template files it customized: its next
production build fails until each is fixed or listed. An app whose files all compile has nothing to do but the config
entry. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Add `'frontend/vite/react-compiler-allowlist.app.json'` to `overrides.ignored` in `cella/cella.config.ts` (the upgrade stops until it is there).
2. Run `pnpm --filter frontend build` and read the functions it prints.
3. Fix each one you can: the compiler's reason names the rule or the syntax it does not handle yet.
4. List the rest in `frontend/vite/react-compiler-allowlist.app.json` as `{ "<file>:<function>": "<why it stays>" }`; with nothing to list, create no file.

## Verify

```sh
pnpm --filter frontend build
pnpm check
```

## Known app bailouts

Scanned on 2026-10-27 at each app's checkout (last upgraded to `a874d1872`) with this template's compiler. Template files the
apps left unchanged compile after the upgrade or are on the template's list, so only these remain.

raak:

- `src/modules/common/logo.tsx:Logo`: `??=` on the color props (a compiler gap).
- `src/modules/task/create-task-form.tsx:CreateTaskForm`: refs read during render (lines 203, 229).
- `src/modules/task/dropdowns/select-members.tsx:SelectMembers`: refs read during render (lines 47, 50).
- `src/modules/task/hooks/use-section-edge-visibility.ts:useSectionEdgeVisibility`: an update to a variable captured in a callback (line 62, a compiler gap).
- `src/modules/task/hooks/use-task-drop-monitor.ts:useTaskDropMonitor`: an optional chain inside try/catch (line 101, a compiler gap).
- `src/modules/task/panel/project-board-panel.tsx:ProjectBoardPanel`: refs read during render (lines 47, 48, 51, 52).
- `src/modules/workspace/header/action-buttons.tsx:WorkspaceActionButtons`: refs read during render (lines 47, 49, 54).

projectcampus:

- `src/modules/channel-tile/search-page.tsx:SearchPage`: hooks called in a loop (line 46); `useChannelListQueries` is the template's hook for one list query per type.
- `src/modules/comment/hooks/use-retained-window.ts:useRetainedWindow`: a ref read during render (line 9).
- `src/modules/item/feed/home-feed.tsx:HomeFeed`: a ref read during render (line 50).
- `src/modules/milestone/milestone-settings.tsx:MilestoneSettings`: `form.watch` from react-hook-form, which the compiler treats as incompatible (line 28); `useFormWithDraft` subscribes with `form.subscribe`.
