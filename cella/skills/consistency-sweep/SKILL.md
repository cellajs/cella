---
name: consistency-sweep
description: Review one module at a time for readability, one way of doing one thing, and fewer lines, in five agent passes with a scout, proofs and a commit per pass.
---

# Consistency sweep

A sweep makes a module easier to read for a developer who meets it for the first time: one way of doing one thing, names that say what a thing is, classes that say one thing once, comments at budget. Fewer lines follow from that; they are never the goal. The template ran this over its frontend in October 2026 (navigation first, then the `common/` folders); this skill is how to run it over app-owned code, where synced files arrive already swept and the app's own files still carry the old patterns.

## What a run looks like

1. **Pick a group** of 2,000 to 5,000 source lines that belong together (a module, or two small ones). Larger than that, split into halves that share no file; if one half imports the other, run the imported half first.
2. **Scout** the group with a read-only agent: it reads every target file in full, checks every lead against the code and against the compiled CSS, and writes `scout-<group>.md` with seven sections (DRY and pattern reuse, naming, Tailwind A, Tailwind B, style and comments, bugs and dead reads, sizing) in the format of [scout.md](./scout.md). A lead without a `file:line` is not a lead.
3. **Decide** the leads the scout flags: a bug or a redundancy is applied; a simplification that changes rendering a little is applied when it removes code, and the commit names the change; a rename that breaks a consumer the group does not own is declined; a product decision (wording, whether a feature exists) is written down for the maintainer. Write the decisions into a group brief (`group-<n>.md`): one section per pass, each naming the scout leads it covers and what was decided.
4. **Run five passes**, each one agent with the shared [brief.md](./brief.md), the group brief and the scout report, in this order: **bugs, dead reads, DRY** (removals first, so later passes work on the final shapes), **naming**, **Tailwind A** (how classes are written), **Tailwind B** (a fresh pair of eyes re-verifies A and applies what A could not decide), **style and comments** (last, so comments are checked against the final code). The rules of each pass are in [passes.md](./passes.md). An agent does not commit; it writes a report with what it applied, what it declined and why, the proofs, and what it saw outside the group.
5. **Review and commit per pass.** Read the diff, run the gates (below), commit with a message that says what the pass did and names the one visible change if there is one. A pass that renames files uses `git mv`. Commit headers stay under 120 characters.
6. **Open the PR** once the five passes are in, with the per-pass reports beside it (the template keeps them in `.todos/consistency-sweep/reports/`, untracked).

## Gates, per pass

```sh
pnpm --filter frontend ts
pnpm exec biome check --write <every directory the pass touched>
pnpm style
pnpm unused            # when an export changed
pnpm --filter frontend exec vitest run <the tests that import a touched file>
```

Stories with play functions run from `frontend/`: `pnpm exec vitest run --project=storybook <story file>`. Before the PR, `pnpm check` once over the whole branch.

## Proofs for class changes

A Tailwind change is applied with a proof, never with taste: [tw-check.mjs](./tw-check.mjs) compiles any class list against the project's real theme and prints the rules in cascade order (`NONE` for a class that emits nothing); a `cn` before/after comparison through the app's own `createCn` config shows what a merge keeps; a measured rect on the running page settles a layout question. The pilot found one lead that only the proof caught: dropping `min-w-5` beside `size-5` would have shrunk every sidebar icon, because the parent's `[&>svg]:size-4` rule outranks `size-*`.

## Screenshots, when the group has UI states

Shoot the group's states before the first pass and after each Tailwind pass on the same seeded database, then diff with [png-diff.mjs](./png-diff.mjs) (a red diff image per mismatch). The stack is the one in the `screenshots` skill: a throwaway database on another port, `DEV_PORT_OFFSET` for the ports, the API and Vite started from the worktree through an environment wrapper, a session from `two-tab-sync-test/driver-lib.mjs`'s `mintSession`, and `PUT /me` with `userFlags.finishedOnboarding` so a fresh admin does not land in the onboarding dialog. Two runs of the same commit differ by up to 0.2% of pixels per image (loader timing, status dots, a transient scrollbar, web-font timing); anything above that is a change to explain.

## Where the method bites

- The scout's leads are hypotheses. A pass verifies each one and declines a wrong one in its report; one wrong "improvement" costs more than a missed one.
- Dependencies move under a long branch. After a rebase that crosses a dependency change, `CI=true pnpm install --frozen-lockfile` in the worktree, or every `pnpm` run dies in pnpm's dependency check without a TTY.
- A convention the sweep introduces (a store alias, a shared helper) can be breached by code merged after the branch's base: grep for the old form after every rebase.
- A file both the template and the app customize (`logo.tsx`, a board layout) takes bug fixes only; everything else there lands as a conflict on the next sync.
