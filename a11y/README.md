# a11y

The a11y package audits the running development app against WCAG 2.2 Level A and AA and fills the conformance ledger.

### TL;DR

`pnpm a11y:run` starts a seeded database and the app, opens every page and state once, scans it with axe, runs browser
checks that axe cannot do, and reviews the code for the rest. Each of the 55 criteria gets its evidence and, where the
evidence is complete, a decision. What needs a person lands on a checklist, and a person's decision survives the next
run. The audit itself takes about two minutes; the first run also builds the frontend and seeds the database.

## Prerequisites

- **Docker**, for the audit's own database. It is apart from the dev database, so a run never changes your data.
- **Chromium** for Playwright, once: `pnpm --filter a11y exec playwright install chromium`.

`pnpm a11y:run` does the rest: it starts the database (`db_a11y` in `backend/compose.yaml`, port 5470), seeds it on
the first run, serves the backend with a built frontend 70 ports above the checkout's dev ports, runs the audit and
stops what it started. It sets the database URLs and the system admin allowlist for that stack itself, so
`backend/.env` stays as it is.

The audit signs in as the seeded admin through `pnpm --filter backend session:mint`, so it runs in development only.

### Against a stack you started yourself

`pnpm a11y` audits whatever answers at the app config's URLs: `pnpm offline` (a built frontend, several times faster
to load than the dev server) or `pnpm dev`. That stack needs a seeded database and `SYSTEM_ADMIN_IP_ALLOWLIST=*` in
`backend/.env` for the system pages. Rebuild after changing frontend code; the audit prints the build time it runs
against.

## Commands

| Command | Description |
| --- | --- |
| `pnpm a11y:run` | Start the audit stack, run the full audit, stop the stack |
| `pnpm a11y:run --keep` | The same, and leave the stack up to rerun states while fixing; `--stop` ends it |
| `pnpm a11y` | Full audit against a running stack: axe, browser probes and code checks |
| `pnpm a11y --states sign-in,org-members` | Audit some states only; writes `a11y/results/ledger-partial.json`, never the ledger |
| `pnpm a11y --only axe` | Refresh some parts only (`axe`, `probes`, `code`); the other parts' evidence is kept |
| `pnpm a11y --workers 2` | States audited at the same time (default 4); lower it on a busy machine |
| `pnpm -C a11y report` | Render the ledger as a draft VPAT and a checklist for the manual pass |
| `pnpm -C a11y decide --file decisions.json` | Record a reviewer's decisions (an agent's or a person's) with their evidence |

A visit that fails (a page that redirects, a check that cannot run) is reported, the command exits with an error, and
the run writes `ledger-partial.json`: an incomplete run never replaces the ledger.

## How a run works

- Each state gets one visit in light mode. [visit.ts](src/visit.ts) runs every check on that one page, in an order
  that keeps the page intact for the next check: read-only checks first, then the ones that restore what they change
  (resizing, text spacing), and last the keyboard walk, whose Escape closes the state's overlay.
- A second visit in dark mode runs axe's contrast rule only, the one rule whose result depends on the color mode.
- A check is a function of an open page that returns findings ([findings.ts](src/findings.ts)). All findings turn
  into evidence in one place, after every visit is done.

## What it writes

- `json/accessibility-conformance.json`: the ledger, committed. One row per criterion with its status, the remarks
  for the report, the evidence and the checks still open. It carries the product's name (the root package name), and a
  ledger of another product is never read: a new app starts its own with its first run.
- `a11y/results/`: raw findings for fixing (`axe.json`, with every failing element), the draft VPAT and the manual
  checklist. Not committed.

## How a row is decided

Each criterion in [criteria.ts](src/criteria.ts) names its checks: `axe`, a browser `probe`, a `code` check or
`manual`. Any failure makes the row Partially Supports. A row becomes Supports or Not Applicable only when all its
checks ran and none of them is manual. Everything else stays open until a reviewer decides it.

Contrast is measured, in both color modes. axe decides most text. Text it cannot decide (over a gradient, an image or a
pseudo-element, or too short) is captured with and without its glyphs and compared pixel by pixel
([probes/contrast.ts](src/probes/contrast.ts)); the same file measures the edge of form controls against what
surrounds them. One more check needs no browser and runs in `pnpm style`: the color tokens of the theme stylesheet
must carry their text and read as text on the page in both modes, so a changed brand color that breaks contrast fails
before any page is opened.

## Reviewing the open rows

Every full run leaves a packet per state in `a11y/results/review/`: a screenshot, the accessibility tree, facts about
the page and the Tab order. A reviewer judges the open criteria from those, the source and the live app, and records
each decision with its evidence through `decide`.

- **An agent** follows the `a11y-review` skill ([cella/skills/a11y-review](../cella/skills/a11y-review/SKILL.md)). Its
  decision is stored as `decidedBy: "agent"` and marked in the draft report: provisional until a person confirms it.
  Agents find most real failures and also report some that are not there, and a missed failure would publish a
  wrong Supports.
- **A person** confirms the agent's rows and decides what needs assistive technology (`--by human`).
  `a11y/results/manual-pass.md` lists both.

A reviewer's decision survives later runs. If the audit later finds a failure on a row a reviewer called Supports, the
row goes back to Partially Supports. A decision can also outlive the code it describes: the checklist lists the rows
whose evidence names a file that changed after the day of the decision, to look at again.

## Scope

[scope-config.ts](scope-config.ts) lists the pages and states the audit covers, following steps 2 and 3 of W3C's
WCAG-EM: every page type, plus overlays such as dialogs, sheets and menus. A `{name}` in a path is filled by the
resolver of that name in the same file, which reads the API as the audit user (`{org}` is an organization that user
administers).

## In an app built on this template

The audit code arrives with a sync; the results and the list of pages are the app's own.

- **`a11y/scope-config.ts`** is pinned to the app (`pinned` in `cella/cella.config.ts`): list your routes and states
  there, and add a resolver for each path placeholder your routes need. A sync never overwrites it.
- **`json/accessibility-conformance.json`** is never synced (`ignored` in `cella/cella.config.ts`). The first
  `pnpm a11y:run` writes the app's own ledger.
- **`frontend/src/modules/auth/legal/legal-config.ts`** holds what the accessibility statement claims
  (`accessibilityReview`); fill it from your own ledger after a person confirmed the rows.
- The state openers in `scope-config.ts` find buttons by their English names. An app with another default language
  changes those names there.

Passing automated checks shows that no failure was found, not that a criterion is met. Treat Supports from the audit
as strong evidence, and spot-check it during the manual pass.
