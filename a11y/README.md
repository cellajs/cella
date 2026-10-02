# a11y

The a11y package audits the running development app against WCAG 2.2 Level A and AA and fills the conformance ledger.

### TL;DR

One command scans every page and state with axe, runs browser checks that axe cannot do, and reviews the code for the
rest. Each of the 55 criteria gets its evidence and, where the evidence is complete, a decision. What needs a person
lands on a checklist, and a person's decision survives the next run.

## Prerequisites

- **Postgres** seeded with app data (`pnpm docker` + `pnpm seed`)
- **Services** running via `pnpm dev`

The audit signs in as the seeded admin through `pnpm --filter backend session:mint`, so it runs in development only.
The system pages need system admin access from localhost: set `SYSTEM_ADMIN_IP_ALLOWLIST=*` in `backend/.env`. A state
that redirects (a guard sending it elsewhere) is skipped and reported, never audited under the wrong name.

## Commands

| Command | Description |
| --- | --- |
| `pnpm a11y` | Full audit: axe, browser probes and code checks |
| `pnpm a11y --states sign-in,org-members` | Audit some states only; writes `a11y/results/ledger-partial.json`, never the ledger |
| `pnpm a11y --only axe` | Refresh some parts only (`axe`, `probes`, `code`); the other parts' evidence is kept |
| `pnpm -C a11y report` | Render the ledger as a draft VPAT and a checklist for the manual pass |

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
