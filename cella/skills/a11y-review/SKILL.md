---
name: a11y-review
description: Run the WCAG audit, fix what it finds, check each fix in the running app, and review the criteria the audit leaves open, recording every decision with its evidence in the conformance ledger.
---

# The accessibility audit loop

`pnpm a11y:run` decides what tools can prove and writes the ledger, `json/accessibility-conformance.json`. The rest it leaves open, with a packet per page for a reviewer. This skill is the procedure around it: run, fix, check the fix, rerun, review, record. `a11y/README.md` explains the audit itself.

An agent's decision is provisional. It is recorded as `decidedBy: "agent"`, the draft report marks it, and a person confirms it before the report is published as final. Until then `report --publish --draft` publishes it as a draft, and the accessibility statement calls the results provisional. Studies of per-criterion agents find most real failures and also report many that are not there, so the rules below lean toward leaving a row open.

## Run

```
pnpm a11y:run            # database, app, audit, stop
pnpm a11y:run --keep     # the same, and leave the stack up for the fix loop
pnpm -C a11y report      # draft report and the checklist a11y/results/manual-pass.md
pnpm -C a11y report --publish --draft   # the draft PDF where the app serves it, and the values for the statement
```

- One audit stack per machine at a time: runs share the database `db_a11y`.
- A kept stack is reached with the `DEV_PORT_OFFSET` the run printed: `DEV_PORT_OFFSET=<n> pnpm a11y --states <ids>` audits some states and writes `a11y/results/ledger-partial.json`, never the ledger. End it with `pnpm a11y:run --stop`.
- A run with skipped visits writes no ledger. Fix the cause (a state's opener that no longer finds its button, a redirect) and run again.
- A probe that fails once and passes on a rerun was a timing miss; rerun before recording it.

## First run in an app

- List the app's routes and states in `a11y/scope-config.ts`: every page type, plus each dialog, sheet and menu. Add a resolver under `placeholders` for every `{name}` in a path.
- The ledger and `scope-config.ts` are the app's own: `ignored` and `pinned` in `cella/cella.config.ts`. A ledger that carries another product's name is never read, so the first run starts a new one.
- The openers find controls by their English names; change the names where the app's default language differs.

## The fix loop

1. Read the failures in `a11y/results/manual-pass.md` and `a11y/results/axe.json` (every failing element per rule and state).
2. Fix the cause in the component, not the instance: a token, a primitive in `frontend/src/modules/ui`, a shared form field.
3. Check the fix in the running app before trusting it. Drive the kept stack with a short Playwright script: `startSession` (`a11y/src/session.ts`) signs in, `openState(session, '<id>')` (`a11y/src/drive.ts`) opens a state of the scope, also as a phone, a zoomed desktop or with motion allowed. Run it with the kept stack's `DEV_PORT_OFFSET` and `NODE_ENV=development`. Check the state the fix is about and one neighbor that shares the component.
4. Changes that alter data (a reorder, a mute) are put back before the next run: the audit opens the first organization the audit user administers, and a changed order changes which one that is.
5. Rerun the full audit. Rows the audit decides move by themselves.
6. A row a reviewer decided keeps its decision and its remark, which now describes the old code. Decide it again, after step 3 showed the fix holds. `manual-pass.md` lists the rows whose evidence names a file that changed since.

What the tools measure for you, so you do not script it again: text contrast where axe cannot decide and the edge of form controls (`a11y/src/probes/contrast.ts`), both color modes; color token contrast and memo dependencies a callback never reads (`pnpm style`).

# Reviewing the open criteria

Use this part after a full audit, when `pnpm -C a11y report` lists open criteria.

## Preconditions

- A fresh `pnpm a11y:run` with no skipped visits.
- Packets in `a11y/results/review/<state>/`: `screenshot.png`, `tree.yml` (the accessibility tree a screen reader works from), `facts.json` (title, headings, landmarks, images, fields, visible label against accessible name, other languages, live regions) and `tab-order.json`. States are listed in `a11y/scope-config.ts`.
- The open rows and the tools' notes: `a11y/results/manual-pass.md`.

## Rules

1. **Evidence first.** Every finding names the state and the element: "org-members: the grid's sort buttons are named only 'button'". A decision without it is refused.
2. **Cover the scope.** Supports means every state the criterion applies to was looked at. Say how many in the evidence.
3. **Verify a failure in the live page** before recording it: open the state, find the element, confirm in the DOM or the tree. A screenshot alone misleads (text in an image, an element below the fold).
4. **When unsure, record `open`** with what was seen. A wrong Supports reaches a published report; an open row costs a person a minute.
5. **Stay inside the criterion.** Read its text in WCAG 2.2 Understanding first; note other problems for the row they belong to.
6. **Do not decide what needs assistive technology.** 4.1.2 and 4.1.3 get findings from the tree, never Supports: only a screen reader shows what is announced.
7. **Ignore development-only UI**: the debug menu, devtools and the "Testing credentials" banner.
8. **A row that failed before becomes Supports only after its fix was driven in the running app.** Reading the diff is not evidence; say in the evidence what you did and what happened.

## What to check

From the packets alone:

| Criterion | Look at | Passes when | Common false alarm |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | `facts.images`, icon buttons in `tree.yml`, the screenshot | Each informative image and icon control has a name that serves the same purpose; decoration is hidden | An avatar next to the person's name is decoration |
| 1.3.1 Info and Relationships | Screenshot against `tree.yml` | What looks like a heading, list, table, group or label is one in the tree | A visual card grid needs no list role |
| 1.3.2 Meaningful Sequence | Order in `tree.yml` against reading order in the screenshot | The tree reads in an order that makes sense | Sidebars before main content |
| 1.3.3 Sensory Characteristics | Instructions in the text | None relies on shape, color, size, position or sound alone | "Above" and "below" with a named target |
| 1.4.1 Use of Color | Links in text, states, errors, badges, charts | Each also differs by text, icon, underline or shape | Decorative color |
| 1.4.5 Images of Text | Screenshot, `facts.images` | Text is text; logos are exempt | Screenshots shown as content |
| 2.4.1 Bypass Blocks | `facts.landmarks` | A main landmark or skip link on each page; an open overlay holds focus, so it needs none | |
| 2.4.3 Focus Order | `tab-order.json` positions against the screenshot | Focus follows the visual and logical order | A grid moves by arrow keys; sticky headers come first |
| 2.4.4 Link Purpose | Links in `tree.yml` | Each name, with its sentence or cell, tells where it goes | Repeated "Edit" inside a named row |
| 2.4.5 Multiple Ways | Navigation, search and links across states | Each page is reachable in two ways; steps in a process are exempt | |
| 2.4.6 Headings and Labels | `facts.headings`, `facts.fields` | Each describes its topic or purpose | |
| 2.5.3 Label in Name | `facts.labelNotInName` | Every entry's name contains its visible text | A count badge beside the label |
| 3.1.2 Language of Parts | `facts.otherLanguages`, text in another language | Such passages carry `lang`; names and technical terms are exempt | |
| 3.2.3, 3.2.4, 3.2.6 | Navigation, repeated controls and help across states | Same order, same names, help in the same place | |
| 3.3.2 Labels or Instructions | `facts.fields` | Each field has a visible label; required and format are stated | A search field with a labelled button |

From the source, with the tools' notes as the starting point: 1.2.1 to 1.2.5 and 1.4.2 (does the app publish media, or only play what users upload?), 2.2.1 (time limits), 2.2.2 (motion that starts by itself), 2.5.1 and 2.5.7 (is there a button for every gesture and drag?), 2.5.2 (do actions fire on release?).

By driving the browser (the `verify` skill explains how to launch, sign in and drive): 3.2.2 (change each kind of field, nothing navigates), 3.3.3 (do error messages say how to fix the input?), 3.3.4 (can destructive actions be confirmed or undone?), 3.3.7 (multi-step flows), 2.1.1 (each function by keyboard: menus, dialogs, the grid, the editor, uploads), 1.4.11 (the audit measures the edge of form controls; measure icons that carry meaning and focus indicators at 3:1), 1.4.13 (hover a tooltip or card, press Escape: it closes, and the sheet or dialog around it stays), 2.5.8 (targets axe could not decide).

## Record

Write the decisions to a JSON file and record them in one go. A decision that the evidence cannot carry is refused, and then nothing is written.

```json
[
  { "id": "2.4.6", "status": "supports", "by": "agent", "evidence": "Read facts.headings and facts.fields of all 26 states: each heading names its section, each field its content." },
  { "id": "1.1.1", "status": "partially-supports", "by": "agent", "remarks": "Icons in the attachment grid have no text alternative.", "evidence": "org-attachments: 3 file-type icons are img with no name (tree.yml); the other 25 states pass.", "where": ["org-attachments"] },
  { "id": "4.1.2", "status": "open", "by": "agent", "evidence": "tree.yml of all states: custom controls expose role, name and state. Needs a screen reader." }
]
```

```
pnpm -C a11y decide --file decisions.json
pnpm -C a11y report
```

`remarks` go into the published report: plain words for someone who uses the product, what does not work and how to get around it. `evidence` is for whoever checks the decision.

## With sub-agents

Split by the three groups above, not by state: each sub-agent reads the packets once for its criteria. Sub-agents return decisions as JSON and record nothing. The orchestrator verifies every failure in the live page, drops what it cannot reproduce, and records the rest in one `decide` call.
