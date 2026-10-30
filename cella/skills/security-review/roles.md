# Roles

Three agents per class and one combiner per run, each with one prompt template, one file to write and one final-message contract. A prompt carries four facts and nothing class-specific: the class id, the review checkout and its commit, the path of the file to write, and the list of earlier reports that settled a vector ("cite, do not redo"). The class section in [classes.md](./classes.md) and the previous agent's file carry the rest; an orchestrator that restates leads in the prompt pays for them twice and gets a word wrong once in thirty times.

Every prompt ends with the rules of [SKILL.md](./SKILL.md#rules-for-every-agent) in one line: "Read at the pinned commit, cite `path:line`, stay inside the class, grep before browsing, no code changes, no requests to deployed hosts, no em dashes."

## Scout

Cheap model. Reads the class section, verifies every path at the checkout, inventories what holds, and ranks what an attacker should try. Five minutes and about 45k output tokens in the first run.

**Prompt.** "You are the SCOUT for security class `<id> <name>` in the cella repo. Read `cella/skills/security-review/classes.md` section `<id>` and `cella/skills/security-review/roles.md` section Scout. Read and cite code in `<checkout>` (main at `<commit>`, node_modules installed); write `<main checkout>/.todos/security-review/briefs/<id>.md`. Earlier reports settled: `<list>`; cite them, do not redo. Advisory rows: `node cella/skills/security-review/tools/classify.mjs .todos/security-review --list <id>`. For a class with a spec checklist (A3, A4, A5, B6, C5), read the spec page once and make the checklist your table. Reply with under 200 words: the lead count, the three strongest leads, and every catalog path that moved or is gone."

**The brief.**

```
# <id> <name>: brief (<commit>)
## Vectors          one bullet per vector: the shape, the advisory ids and CWEs that name it, where it lands in this repo
## Files            every catalog path with "exists", "moved to <path>" or "gone", plus call sites found by grep, one line each
## Holds            tests and lines that refuse an attack today, each with the attack it refuses
## Open from history what earlier reports or plans leave open for this class; else "none found"
## Questions        the catalog's Asks, made concrete against the verified files, with what the code says so far
## Not this class   vectors that belong elsewhere, with the class id
## Table            (inventory classes) the table the Asks call for, every cell cited
## Leads            ranked: one line per lead the judge should attack first, with the premise to re-check
```

A brief states what the code does with lines; it never says "probably". A hold without a test says so: that is a test candidate.

## Attack-and-judge

Strongest model. Writes the attack file first, then judges every row of it against the code and the tests, then writes the report. The attack file is closed once the judging starts: a verdict may say a row was wrong, never rewrite the row.

**Prompt.** "You are the ATTACKER and then the JUDGE for security class `<id> <name>`. Read `roles.md` section Attack-and-judge, the brief `briefs/<id>.md` and the earlier reports it cites. Read and cite code in `<checkout>` (main at `<commit>`). Write `reports/<id>-attacker.md` first, close it, then write `reports/<id>.md`. Probes run against the checkout or a scratch script under the scratchpad, never against a deployed host. Reply with under 200 words: the TL;DR, one line per CONFIRMED gap as `G<n> | gain | fix files | builder tier`, and the counts (confirmed, refuted, unsure)."

For an inventory class the prompt says "You are the JUDGE" and names the brief's table: the judge attacks each row in place of the attack file and writes only the report.

**The attack file.** Per lead and per vector the brief lists:

```
### V<n> <vector>
- Attack: <input> -> <path, lines> -> <effect>. Gain: <one of the six>.
- Preconditions: <role, state, deployment>
- Stopped by: <line or test> | nothing found
- Verdict: GAP | HOLDS | UNSURE (what would settle it)
```

It ends with `## Gaps, by gain` (GAP and UNSURE rows, highest gain first) and `## Measurements` (what only a running stack settles, with the exact request).

**The report.** Every GAP and UNSURE row is confirmed or refuted with lines; a refutation attempt is written for each, so a confirmation shows what it survived.

```
# <id> <name>: what holds and what does not
**Status:** reviewed on main at <commit> (<date>); attacker file and brief beside it.
### TL;DR          four to six bullets, bold lead words
## 1. Gaps         by gain. **G<n>. <title>.** CONFIRMED. The cause (lines). What it allows (the attack, the gain). Fix (smallest change, the file, whether the shape repeats elsewhere).
## 2. Layers that hold   the attacks that fail today and the line or test that stops each
## 3. Refuted      the rows that do not stand, one line each with the line that stops them
## 4. Docs that promise more than the code   sentence, file, what the code does
## 5. Test candidates    one per confirmed gap or untested hold: name (after the attack), reason, file
## 6. Measurements       what only a running stack settles, with the exact request
## 7. Decisions          where a fix needs a choice, with the default
## 8. Version minimums   package, minimum, advisory, and whether pnpm-workspace.yaml or the lockfile already holds it
## 9. Fix brief          the builder's input, see below
```

The four reasons a test earns its place (`cella/TESTING.md`): it proves an attack fails, reproduces a shipped bug, pins a contract another module or an app depends on, or checks a table-driven rule too wide to eyeball. A test that mirrors its implementation is not a candidate.

**The fix brief (§9).** The first line is the tier: `small` (at most three files, an exact change, no migration) or `large`. Then per confirmed gap: the file and line, the exact change in one or two sentences, the test (file, name after the attack, reason), the doc sentence to correct, and whether the change is breaking (an alignment) or needs a migration. Then the tests the builder runs while iterating, and the commit subject. A judge who cannot write the exact change writes the decision into §7 instead and leaves the gap out of the fix brief.

## Builder

Model by the fix brief's tier. Works only in its worktree, reads the report's §9, builds exactly that, verifies in the order SKILL.md gives, and leaves one commit. It pushes nothing and opens no PR: the combiner does that once for the run.

**Prompt.** "You are building the fix for security class `<id> <name>`. Work only in the worktree `<worktree>` (branch `security/<run>-<id>`, from `<base>`, which is main at `<commit>` or another class's branch); read `<main checkout>/.todos/security-review/reports/<id>.md` §9 (the fix brief) and §1 for the attacks behind it, and `cella/AGENTS.md`. Build the fix brief, nothing else; where a line in it does not match the code, stop and say so in your reply instead of guessing. Verify: the fix brief's tests while iterating, then the whole `backend/tests/security` folder once, then `pnpm -C <worktree> check`. Test isolation per `roles.md` section Builder. Commit once with the message below; do not push. Reply with under 150 words: the branch and commit, the tests run with pass counts, whether `pnpm check` passed, any migration and its hand-written statements, and any fix-brief line you could not apply."

**Test isolation.** A branch with a migration starts a throwaway database (SKILL.md, Test isolation) and passes `DB_TEST_PORT`; a branch without one uses the shared test database. Never root `pnpm test`, `pnpm docker:test` or `docker compose` from a worktree; never a leading `cd`.

**The commit.** A conventional subject that names the behaviour and ends with the class id, `!` when the change is breaking: `fix(auth)!: one step-up code per session (A1)`. The body takes one paragraph per gap: the cause with its line, what it allowed, the fix. A breaking change carries its alignment folder in the same commit. The attribution lines the session names close it. This message is what the changelog prints and what a reviewer reads when they split the class off, so it stands on its own.

**The TESTING.md sentence.** When no bullet in the "attacks we test against" list covers the attack, one bullet in the same style, bold lead words, one sentence.

## Combiner

Strongest model, one per run, after every builder has reported. It turns the class branches into the run's branch and opens the one PR.

**Prompt.** "You are combining the class fixes of security review run `<run>` into one PR. Make the worktree `<worktree>` on branch `fix/security-review-<run>` from main at `<commit>`. Merge these class branches in this order with `--no-ff`: `<list, stacked ones after their base, request-schema sweeps last>`. Read `roles.md` section Combiner. Reply with under 250 words: the PR URL, each conflict and how it was resolved, the migration consolidation, every suite with pass and fail counts, whether `pnpm check` passed, and anything you could not settle."

**Conflicts.** The fixes are independent, so a conflict keeps both sides' intent: every new bullet in `cella/TESTING.md`, every key in a locale file, every row in a table test, every alignment folder, and one bump of `appConfig.clientCacheVersion` to the highest value any branch reached. Fix code is not rewritten to resolve a conflict; when two fixes touch the same lines, the two commit messages decide, and a conflict they cannot decide goes into the reply.

**Migrations.** Read every migration the branches added and copy out each hand-written statement. Delete those migrations and their journal and snapshot entries, run `pnpm -C <worktree> generate` once, and put the hand-written statements back before the constraint each protects. Diff the deleted SQL against the generated SQL: every statement is present or the reply says why it is not needed. When `pnpm generate` produces nothing or something unexpected, stop and report; never hand-write a migration.

**Verification.** A throwaway database (the branch has migrations), then the whole backend core suite once: `DB_TEST_PORT=<port> pnpm -C <worktree>/backend exec cross-env TEST_MODE=core vitest run`. A file that fails under load is rerun alone once before it counts. Then the `yjs` and `infra` suites when a class touched them, then `pnpm -C <worktree> check`. A failure the combiner can trace to one class goes back to that class's builder by message; an expectation a fix deliberately changed (a cap answering 400 where a guard answered 401) is updated in its own commit, named in the PR body.

**The PR.** Title `fix!: security review <run>` (without `!` when no class is breaking). The body opens with one line per class: id, the commit subject, the gain. Then a paragraph on the migration consolidation, the conflict resolutions that needed a judgment, `## Checked` with every suite and its pass counts and `pnpm check`, the line "To split a class off, cherry-pick its commit onto a branch from main.", a `## Squash body` block with every class's commit subject on its own line for whoever merges (SKILL.md, Gotchas), "Part of #<issue>", a `## Size` section from `pnpm -C <worktree> cella stats --since origin/main --md` with one line per kind that grew, and the attribution lines the session names.

## Final messages and the ledger

A final message is the only thing the orchestrator reads, so it carries what the ledger row needs and nothing else: the scout's lead count and moved paths, the judge's confirmed lines with tiers and counts, the builder's branch, commit and test results, the combiner's PR URL. The ledger row is `| class | reviewed at | date | confirmed gaps | refuted | PR and commit | tests added | TESTING.md sentence |`; the orchestrator fills it from those messages without opening a file.
