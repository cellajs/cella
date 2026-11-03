---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: react-compiler-allowlist.app.json, use no memo
---

# Compiler bails fail the build; allowlists become 'use no memo' directives

The React Compiler now runs with `panicThreshold: 'all_errors'`, so a bail is a hard error in dev and in the build. The allowlist files and `frontend/vite/react-compiler-guard.ts` are gone: convert each entry of your `frontend/vite/react-compiler-allowlist.app.json` into a `'use no memo'` directive at the top of the named function, with the entry's reason as a comment above it, then delete the file.

## What & why

`reactCompilerPreset({ panicThreshold: 'all_errors' })` in `frontend/vite.config.ts` replaces `react-compiler-guard.ts`, `react-compiler-allowlist.json` and `react-compiler-allowlist.app.json`. A bail now fails the dev transform too; the guard only failed the production build, so a new bail went unseen until a push. The exemption and its reason move onto the function they describe.

## Blast radius

Every app with entries in `react-compiler-allowlist.app.json` (the file is app-owned). An app with no entries only deletes nothing and rebuilds. No database, lens or cache bump.

## Run

No script: manual.

## Manual steps

1. For each `"<file>:<function>": "<reason>"` entry in `frontend/vite/react-compiler-allowlist.app.json`: open the file, add `'use no memo';` as the first statement of that function with `// <reason>` above it.
2. Delete `frontend/vite/react-compiler-allowlist.app.json` and its `overrides.ignored` entry in `cella/cella.config.ts` if your app re-added one.

## Verify

```sh
pnpm --filter frontend build
pnpm check
```
