# a11y

The a11y package audits the running development app against WCAG 2.2 Level A and AA and fills the conformance ledger.

### TL;DR

One command opens every page and state once, scans it with axe, runs browser checks that axe cannot do, and reviews
the code for the rest. Each of the 55 criteria gets its evidence and, where the evidence is complete, a decision. What
needs a person lands on a checklist, and a person's decision survives the next run. A full run takes about two minutes.

## Prerequisites

- **Postgres** seeded with app data (`pnpm docker` + `pnpm seed`)
- **Services** running via `pnpm offline`: the backend plus a built frontend, which loads several times faster than
  the dev server. Rebuild after changing frontend code; the audit prints the build time it runs against.
  `pnpm dev` works too and suits `--states` runs while fixing.

The audit signs in as the seeded admin through `pnpm --filter backend session:mint`, so it runs in development only.
The system pages need system admin access from localhost: set `SYSTEM_ADMIN_IP_ALLOWLIST=*` in `backend/.env`.
All URLs come from the app config, so the audit follows whatever ports the stack runs on.

## Commands

| Command | Description |
| --- | --- |
| `pnpm a11y` | Full audit: axe, browser probes and code checks |
| `pnpm a11y --states sign-in,org-members` | Audit some states only; writes `a11y/results/ledger-partial.json`, never the ledger |
| `pnpm a11y --only axe` | Refresh some parts only (`axe`, `probes`, `code`); the other parts' evidence is kept |
| `pnpm a11y --workers 2` | States audited at the same time (default 4); lower it on a busy machine |
| `pnpm -C a11y report` | Render the ledger as a draft VPAT and a checklist for the manual pass |

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
  for the report, the evidence and the checks still open.
- `a11y/results/`: raw findings for fixing (`axe.json`, with every failing element), the draft VPAT and the manual
  checklist. Not committed.

## How a row is decided

Each criterion in [criteria.ts](src/criteria.ts) names its checks: `axe`, a browser `probe`, a `code` check or
`manual`. Any failure makes the row Partially Supports. A row becomes Supports or Not Applicable only when all its
checks ran and none of them is manual. Everything else stays open until a person decides it: set `status` and
`remarks` in the ledger and set `decidedBy` to `"human"`.

## Scope

[scope.ts](src/scope.ts) lists the pages and states the audit covers, following steps 2 and 3 of W3C's WCAG-EM:
every page type, plus overlays such as dialogs, sheets and menus. Add your app's routes there.

Passing automated checks shows that no failure was found, not that a criterion is met. Treat Supports from the audit
as strong evidence, and spot-check it during the manual pass.
