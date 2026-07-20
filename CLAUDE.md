# CLAUDE.md

Primary agent guidelines for this repo live in @cella/AGENTS.md — read it.

## Before you finish
**Always run `pnpm check` at the repo root after any code change, and only report the work done once it passes clean.** It runs `sdk` regen + typecheck + `lint:fix` and is the single gate for whether a change is sound. Never claim a change is complete without a clean `pnpm check`; if it fails, fix it or say so explicitly.
