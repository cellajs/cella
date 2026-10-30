---
name: security-review
description: Review the app one vector class at a time (who acts, what they may do, what goes in, what comes out, abuse and failure, platform) with a cheap scout, one attack-and-judge agent and a fix commit per class, all of a run in one PR. Use it when a new advisory names a vector no brief covers, for a periodic pass over the classes that changed most, or to run an app's own entities through the access classes.
---

# Security review by vector class

The unit of a review is a **vector class**, never an advisory or a file: every advisory, OWASP item and spec rule that names the same shape of attack joins one iteration, and the iteration ends in a version minimum, a rule in AGENTS.md where the shape repeats, and a test in `backend/tests/security/` that reproduces the attack. [classes.md](./classes.md) holds the 28 classes with their files, holding tests and questions; [roles.md](./roles.md) the prompts, file formats and final-message contracts of the three agents. The template ran every class once in October 2026 (cella#1604, 32 PRs); this skill is the distilled method, sized so a class costs about a third less than that run did.

**One run, one PR.** Every class a run fixes becomes one commit on the run's branch, and the run opens a single PR. A reviewer who wants a class on its own cherry-picks that commit onto a branch of its own before the merge. The first run opened 24 PRs for 28 classes, each with its own body, size table and full check, and then combined them into one; a run that builds toward one branch skips the 24 bodies and runs the full suite once.

## When to run a class

- **A new advisory.** `tools/classify.mjs` files it into a class. Rerun that class only when the advisory names a sub-vector the class's last brief lacks; otherwise the version minimum and the existing test cover it.
- **A periodic pass.** Rank classes by commits since their last reviewed commit touched their files (`git log --since` over each class's file list) and run the top batch.
- **An app after a new entity or module.** Run B1, B2, B3 and E2 over the app's own entities: the briefs are the template's, the attacks are against the app's hierarchy and roles.
- **A new boundary.** Code that parses, signs, fetches, renders or stores for the first time gets its class before it ships.

## The pipeline per class

Each class goes through up to three agents, each writing one file into the untracked `.todos/security-review/` folder (`briefs/<class>.md`, `reports/<class>-attacker.md`, `reports/<class>.md`). Open findings never enter the public repo; the public residue is the run's PR: per class a fix commit, its test, and one attack sentence in `cella/TESTING.md`.

| Step | Agent | Model | Reads | Writes |
| --- | --- | --- | --- | --- |
| 1 | Scout | cheap (Sonnet) | the class section, the code at the pinned commit | the brief, ending in ranked leads |
| 2 | Attack-and-judge | strongest (Opus or above) | the brief, earlier reports it must cite | the attack file, then the report with a fix brief |
| 3 | Builder | by size (below) | the report's fix brief | one commit on a class branch |
| 4 | Combiner | strongest, once per run | the builders' final messages | the run's branch and its one PR |

**Two shapes.** A *reasoning class* (the scout found leads) runs all three steps. An *inventory class* (C1, C3, B3, C8, D1, E1, F1, F2, or any class whose scout found no lead) skips the attack file: the judge attacks the scout's table row by row and writes the report. A class whose brief has more than eight leads (C1 in the first run) keeps two agents, an attacker and a defender, or splits into two halves that share no file: a judge refuting its own twelfth attack drops rigor.

**One agent attacks and judges.** The first run paid an attacker and a defender per class; the defender refuted whole attacker rows in about a quarter of the 22 paired classes and otherwise narrowed details and designed the fix. The three classes that ran as one attack-and-judge agent (C2, D2, E3) found three, three and zero confirmed gaps with four, six and one refutations of their own rows, at 58 percent of the pair's output tokens and 47 percent of its context reads. The separation that matters is the written attack before the verdict, so the agent writes the attack file first and may not edit it while judging.

**Builder by size.** A fix brief that names at most three files, an exact change and no migration goes to the cheap model (five such PRs averaged 13k output tokens against 162k for the strongest model's builds). Anything with a migration, an alignment, a design choice or a sweep over many files goes to the strongest model.

## One run

1. **Pin and check out.** Pick at most nine classes for one run. Note the `main` commit, make a detached review checkout (`git worktree add --detach .claude/worktrees/sec-review-<n> <commit>`) and install there (`pnpm -C <checkout> install --frozen-lockfile`): probes need `node_modules`. Agents read and cite code in the checkout and write files into the main checkout's `.todos/security-review/`.
2. **Open the ledger section.** In `ledger.md`: the commit, the checkout path, the open PRs the checkout lacks (so nobody reports a fixed gap), and which earlier reports settled which vectors ("cite, do not redo").
3. **Launch every scout in one message.** The prompt is the scout template in roles.md plus four facts: class id, checkout path and commit, the brief path, and the settled-vectors list. Nothing class-specific beyond that: the class section carries it.
4. **Launch the judge on each scout's reply.** Pick the shape from the reply's lead count. The prompt names the class, the checkout, the brief and the shape; it does not restate the leads. The judge's final message is the TL;DR, one line per confirmed gap and the counts, under 200 words.
5. **Route each build.** Read the report's `## 9. Fix brief` header line (the builder tier the judge proposes) and start the builder in a worktree of its own (`.claude/worktrees/sec-<class>`, branch `security/<run>-<class>` from the pinned commit), with the builder template plus the class and the worktree. The builder reads the fix brief itself, commits once and pushes nothing. A fix that builds on another class's fix branches from that class's branch and says so in its final message. Zero confirmed gaps and no untested hold: no builder, the row says "holds".
6. **Verify in the right order.** A builder runs the tests its fix brief names while iterating, then the whole `backend/tests/security` folder once, then `pnpm check` once. At most two whole-suite runs at a time on one machine; three concurrent runs made every suite, `main` included, time out at 30 seconds in the first run.
7. **Combine once.** When every builder has reported, one combiner agent ([roles.md](./roles.md#combiner)) makes the run's branch `fix/security-review-<run>` from the pinned commit and merges the class branches: stacked ones after their base, sweeps over shared request schemas last. It replaces the branches' migrations with one generated migration, runs the whole backend core suite and `pnpm check` once, and opens the run's PR. The core suite runs here because a cap that answers 400 before a guard that answered 401 breaks an expectation outside the security folder, and only the combined branch shows every such interaction.
8. **Record.** One ledger row per class (commit, confirmed gaps, refuted, the run's PR with the class commit, tests, the TESTING.md sentence), one issue comment per run, and the measurements only a deployed host can answer listed for a person.
9. **One orchestrator session per run.** State lives in the ledger, not in the conversation: the orchestrator reads final messages, never the briefs or reports, and starts a fresh session for the next run. The first run's orchestrator held a median context of 385k tokens over 568 turns and wrote 500k characters of prompts; templated prompts and a session per batch halve that.

## Rules for every agent

- Read at the pinned commit. Cite every claim as `path:line`, repo-relative. A claim without a line says it is a guess.
- Stay inside the class. A vector of another class gets one line, "belongs to <class>".
- Grep before browsing; read the files the brief names and whatever a cited line forces you to follow. No repo surveys.
- A gap is a gap only with the attack written down: input, code path with lines, effect, and the gain (cross-tenant read, account takeover, code execution, secret exposure, denial of service, integrity). "Holds" names the line or the test that refuses the attack today.
- Nothing "just in case": a layer with no attack behind it is a §7 decision, not a fix.
- Never send a request to a deployed host. A question only a deployed host answers is a measurement in §6, with the exact request, for a person to run.
- Scouts and judges change no code and commit nothing. A builder or the combiner edits only its own worktree, and only the combiner pushes.
- Plain words, no em dashes, the concrete input and effect named.

## Test isolation

The shared test database belongs to every worktree. A builder whose branch has a migration gives itself a throwaway database first ([verify: a throwaway database](../verify/SKILL.md#a-throwaway-database), image `cella-db_test:latest`, the CDC flags `-c wal_level=logical -c max_wal_senders=10 -c max_replication_slots=10` added) and passes its port as `DB_TEST_PORT` in the command's environment: `DB_TEST_PORT=<port> pnpm -C <worktree>/backend exec cross-env TEST_MODE=core vitest run <files>`. Never root `pnpm test`, `pnpm docker:test` or `docker compose` from a worktree, and never a leading `cd`: every command takes an absolute path or `pnpm -C`, `git -C`.

## Budget

Averages per agent from the first run, the baseline the next run is measured against. Output tokens drive cost; context reads show how long an agent kept exploring.

| Agent | Output tokens | Context reads | Turns | Minutes |
| --- | --- | --- | --- | --- |
| Scout (Sonnet) | 44k | 5.6M | 56 | 5 |
| Attacker (Opus) | 124k | 18.8M | 130 | 13 |
| Defender (Opus) | 135k | 18.3M | 128 | 14 |
| Attack-and-judge (Opus) | 151k | 17.3M | 127 | 14 |
| Builder, large (Opus) | 162k | 34.7M | 183 | 26 |
| Builder, small (Sonnet) | 13k | 1.5M | 25 | 4 |
| Combiner, 24 branches (Opus) | 167k | 42.3M | 313 | 32 |

A class ran at about 465k output tokens with the pair and a large build; the shapes above bring a typical class to about 300k. The whole first run: 111 agents, 12.8M output tokens, 2.1 billion context-read tokens, six hours of wall time for 28 classes and 32 PRs.

## Gotchas from the first run

- **Paths move.** The class catalog's paths are verified at the commit it names; a scout that trusts them without `ls` writes a brief the judge has to correct.
- **A brief can be wrong.** The B6 scout read a schema as refusing `..` that accepted it; the judge checked the premise before building on it. Every lead's premise is re-read, not inherited.
- **Only the files you list are what you test.** A builder that ran the files its brief named missed a boundary test two folders over (#1644); another that ran the security folder missed a sign-in expectation (#1630). Steps 6 and 7 above are the order.
- **A cut-off builder leaves its state on disk.** Commit early in the worktree, so another agent can finish after a usage limit ends the first.
- **A pull request's CI runs a subset.** The full backend suite runs in the merge queue only. In the first run one class broke `response-secrets` on its own, and three tests needed to wait for mail sent after the answer; only the combiner's full core run showed either. A class split off the run's PR runs the full core suite again before it merges.
- **Migrations from parallel branches do not chain.** Drizzle snapshots are incremental, so two class branches that each generated a migration from the same commit conflict in the journal. A builder generates one to run its tests; the combiner deletes them all and generates one for the combined schema, keeping every hand-written statement (a dedupe before a unique index, a `side_effects` file).
- **Squash with the class subjects in the body.** The repo allows only squash merges on a linear history. Each class's commit subject goes on its own line at the end of the squash body, a blank line between them, and release-please files each as its own changelog entry with its breaking marker (cella#1656). The PR title is the squash subject.
- **The repo's `gh` quirks.** `gh api graphql -F name=@scope/pkg` reads a file; use `-f`. `gh pr edit` can fail without output: `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@file`.
- **Background runs and `cd` do not mix.** A `pnpm check` started in the background beside a foreground `cd` ran in the wrong package; use `pnpm -C <dir> check` in the foreground.

## Files

```
cella/skills/security-review/
  SKILL.md                 this file: when, the pipeline, the batch steps, the rules
  classes.md               the 28 classes: gain, merges, advisories, files, holds, asks
  roles.md                 prompt templates, file formats and final messages per agent, the combiner included
  tools/ghsa-intake.mjs    every GitHub advisory ever published for the direct dependencies
  tools/ghsa-retry.mjs     re-query the packages an intake failed on
  tools/classify.mjs       advisory to class, by package then by CWE; --list <class>
.todos/security-review/    untracked: data/, briefs/, reports/, ledger.md
```

Intake: `node cella/skills/security-review/tools/ghsa-intake.mjs . .todos/security-review/data` (needs `gh` signed in), then `node cella/skills/security-review/tools/classify.mjs .todos/security-review` and `--list <class>` for one class's rows.
