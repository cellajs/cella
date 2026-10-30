---
name: css-review
description: Review how the whole frontend writes and ships its classes and CSS (state variants nothing can satisfy, one mechanism per state, style-only props, shorter classes through Tailwind itself, what a state change costs in the browser) with scripts first, then agent passes, a sibling comparison and a refutation, and a fix commit per pass in one PR. Use it after a large UI change, a Tailwind or Base UI upgrade, or for a periodic pass; the consistency sweep goes module by module for readability.
---

# CSS review

Most of what this review finds compiles, so `pnpm style` passes it: a variant nothing can satisfy, a class that restyles the whole page on a flip, a shorter form that changes a line height. A script finds these cheaply and an agent judges them. An agent reading files without the scripts' leads costs far more and misses whatever needs the whole repo to prove.

**One run, one PR.** Each pass that fixes something becomes one commit on the run's branch.

## A run

Work in a worktree. Run the tools from the repo root of the checkout under review: each reads the repo it lives in and prints it on its first line.

1. **Scan.** Run the tools below and hand their output to the passes.
2. **Four passes**, one agent each, in the order of [passes.md](./passes.md): state and `cn`, props, classes and drift, performance. An agent edits nothing and returns its report as its final message; the coordinator saves it beside the run.
3. **Sibling comparison.** One agent compares families of sibling components ([passes.md](./passes.md#5-sibling-comparison)). A census cannot see this, since each finding is an absence or a difference between components. It stops after three more families with nothing of medium value or higher. A third iteration runs only if this one finds something of high value, and it runs in the browser.
4. **Refutation.** A fresh agent receives the top findings and every new rule, and tries to break them ([passes.md](./passes.md#6-refutation)). Hand it the claims and the code, never the reasoning.
5. **Fix**, one commit per pass, each change with the proof [How far to trust a finding](#how-far-to-trust-a-finding) asks for. Run `pnpm check`. A change that breaks an app ships an alignment.
6. **Turn finds into rules.** A finding a regex or the AST can catch becomes a `pnpm style` rule in the same PR, so the next run does not pay for it again. A rule that fails on an app's own code needs an alignment too.

## Tools

In [tools/](./tools/), run with `node`:

| Tool | What it gives | Expect |
| --- | --- | --- |
| `state-check.mjs` | Variants and group consumers with no emitter, markers with no consumer, a utility used as a selector. Carries its own positive control | About half of its lines are true |
| `canon-check.mjs` | Tailwind's canonicalizer, split into rewrites proven equal and rewrites held for a person | Some safe rewrites are held; a wrong one must never pass |
| `prop-table.mjs <output json>` | Every prop by how it is used, with call sites and values | About 1 style-only prop in 10 is a finding |
| `flip-scan.mjs <origin> [--session <email>] <path> ...` | How many elements each class flip on body or html restyles, with controls | `HIGH` is a lead; a theme or focus view flip may stay high by design |
| `touch-probe.mjs <origin> [--session <email>] <path> ...` | Controls invisible and tappable at a touch viewport | Few lines, nearly all true |

The two browser tools need a running stack and run from the repo root (`verify` owns stack setup). `--session` mints a session and signs it out afterwards, so it writes a session row to the database it runs against. For class compile proofs, [tw-check.mjs](../consistency-sweep/tw-check.mjs) compiles any class list against the real theme.

## How far to trust a finding

| Claim | What makes it a finding |
| --- | --- |
| What the CSS or `cn` does | One independent run: a compile, a `cn` run, a grep |
| "Nothing uses this" | The same grep in every app checkout that `cella/cella.config.ts` lists, stories excluded as emitters. A story can be the only thing that makes a class work |
| "This renders differently" | Computed values on the real element, in both modes. Reasoning that stops at the selector misses tokens with equal values and a `dark:` variant that outranks the state |
| "This is faster" | A before and after on the named page and metric, with a no-op control ([measuring.md](./measuring.md)). A true mechanism does not prove a gain on another metric |
| A new general rule | Provisional until someone has tried to break it, written in terms of what triggers it and with its counterexamples |

An example with no `file:line` is unverified. A wrong "improvement" costs more than a missed one: decline a lead you cannot prove, and record it in the report.

## In an app

Scope comes from `fileScope` in [tools/lib.mjs](./tools/lib.mjs), against the upgrade baseline in `cella/cella.manifest.json`. A diff against a template checkout flags files that only differ from its newer or uncommitted state.

| Class of the file | What a finding means |
| --- | --- |
| `app`: app-only, `owner: 'app'`, ignored or pinned | Fix it here; an upgrade never reaches it, even when it is byte-identical to the template |
| `drifted` and marked | Fix it within the marked difference ([cella-upgrade](../cella-upgrade/SKILL.md) has the marker) |
| `drifted` and unmarked | Settle the drift first, by the matrix in cella-upgrade |
| `identical` | Do not edit it. Report it upstream, or mark it as drift with a reason and an unwind condition if it cannot wait |

What does not carry over from the template:

- **Conclusions about usage.** An app may emit an attribute the template only reads, or call a prop the template never passes. In the template, deleting a hook needs the grep across apps and counts as breaking.
- **Performance rankings.** Measure the app's own heavy surface; a static read of it is a lead.
- **New classes.** `app.css` loads inside a layer, where `@utility` and `@custom-variant` fail to compile, and `cn.ts` belongs to the template. A repeated set in an app takes a `tw` constant, a small component or a plain CSS rule, and a plain CSS class takes no variants.
