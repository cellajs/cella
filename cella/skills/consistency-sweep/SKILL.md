---
name: consistency-sweep
description: Review one module at a time for readability, one way of doing one thing, and fewer lines, in five agent passes with a scout, proofs and a commit per pass.
---

# Consistency sweep

A sweep makes a module easier to read for a developer who meets it for the first time ([brief.md](./brief.md#goal-and-order-of-priorities) has the goal and the rules). The template ran this over its frontend in October 2026 (navigation first, then the `common/` folders); this skill is how to run it over app-owned code, where synced files arrive already swept and the app's own files still carry the old patterns.

## What a run looks like

1. **Pick a group** of 2,000 to 5,000 source lines that belong together (a module, or two small ones). Larger than that, split into halves that share no file; if one half imports the other, run the imported half first.
2. **Scout** the group with a read-only agent ([scout.md](./scout.md)), which writes `scout-<group>.md`.
3. **Decide** the leads the scout flags by the brief's [goal and priorities](./brief.md#goal-and-order-of-priorities); a rename that breaks a consumer the group does not own is declined. Write the decisions into a group brief (`group-<n>.md`): one section per pass, each naming the scout leads it covers and what was decided.
4. **Run five passes** in the order of [passes.md](./passes.md), each one agent with the shared brief, the group brief and the scout report. An agent does not commit; it writes the report the brief describes.
5. **Review and commit per pass.** Read the diff, run the brief's [verification](./brief.md#verification), commit with a message that says what the pass did and names the one visible change if there is one.
6. **Open the PR** once the five passes are in, with the per-pass reports beside it (the template keeps them in `.todos/consistency-sweep/reports/`, untracked). Run `pnpm check` once over the whole branch first.

## Proofs for class changes

A Tailwind change is applied with a proof, never with taste: [tw-check.mjs](./tw-check.mjs) compiles any class list against the project's real theme and prints the rules in cascade order (`NONE` for a class that emits nothing); a `cn` before/after comparison through the app's own `createCn` config shows what a merge keeps; a measured rect on the running page settles a layout question. The traps a proof catches are in [passes.md](./passes.md#3-tailwind-a).

## Screenshots, when the group has UI states

Shoot the group's states before the first pass and after each Tailwind pass on the same seeded database, then diff with [png-diff.mjs](./png-diff.mjs) (a red diff image per mismatch). Run the stack of [A throwaway database](../verify/SKILL.md#a-throwaway-database) from the worktree and sign in as the verify skill does. Two runs of the same commit differ by up to 0.2% of pixels per image (loader timing, status dots, a transient scrollbar, web-font timing); anything above that is a change to explain.

## Where the method bites

- The scout's leads are hypotheses. A pass verifies each one and declines a wrong one in its report; one wrong "improvement" costs more than a missed one.
- Dependencies move under a long branch. After a rebase that crosses a dependency change, `CI=true pnpm install --frozen-lockfile` in the worktree, or every `pnpm` run dies in pnpm's dependency check without a TTY.
- A convention the sweep introduces (a store alias, a shared helper) can be breached by code merged after the branch's base: grep for the old form after every rebase.
- A file both the template and the app customize (`logo.tsx`, a board layout) takes bug fixes only; everything else there becomes a conflict on the next upgrade.
