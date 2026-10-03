---
name: a11y-review
description: Review the WCAG criteria the accessibility audit leaves open, from its review packets, the source and the live app, and record each decision with its evidence in the conformance ledger.
---

# Reviewing the open WCAG criteria

`pnpm a11y` decides what tools can prove. The rest it leaves open, with a packet per page for a reviewer. This skill is that reviewer's procedure. Use it after a full audit, when `pnpm -C a11y report` lists open criteria.

An agent's decision is provisional. It is recorded as `decidedBy: "agent"`, the draft report marks it, and a person confirms it before anything is published. Studies of per-criterion agents find most real failures and also report many that are not there, so the rules below lean toward leaving a row open.

## Preconditions

- Stack running (`pnpm offline`) and a fresh `pnpm a11y` with no skipped visits.
- Packets in `a11y/results/review/<state>/`: `screenshot.png`, `tree.yml` (the accessibility tree a screen reader works from), `facts.json` (title, headings, landmarks, images, fields, visible label against accessible name, other languages, live regions) and `tab-order.json`. States are listed in `a11y/src/scope.ts`.
- The open rows and the tools' notes: `a11y/results/manual-pass.md`.

## Rules

1. **Evidence first.** Every finding names the state and the element: "org-members: the grid's sort buttons are named only 'button'". A decision without it is refused.
2. **Cover the scope.** Supports means every state the criterion applies to was looked at. Say how many in the evidence.
3. **Verify a failure in the live page** before recording it: open the state, find the element, confirm in the DOM or the tree. A screenshot alone misleads (text in an image, an element below the fold).
4. **When unsure, record `open`** with what was seen. A wrong Supports reaches a published report; an open row costs a person a minute.
5. **Stay inside the criterion.** Read its text in WCAG 2.2 Understanding first; note other problems for the row they belong to.
6. **Do not decide what needs assistive technology.** 4.1.2 and 4.1.3 get findings from the tree, never Supports: only a screen reader shows what is announced.
7. **Ignore development-only UI**: the debug menu, devtools and the sign-in hint banner.

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

By driving the browser (`cella/skills/verify` explains how): 3.2.2 (change each kind of field, nothing navigates), 3.3.3 (do error messages say how to fix the input?), 3.3.4 (can destructive actions be confirmed or undone?), 3.3.7 (multi-step flows), 2.1.1 (each function by keyboard: menus, dialogs, the grid, the editor, uploads), 1.4.11 (measure borders and icons at 3:1), 2.5.8 (targets axe could not decide).

## Record

Write the decisions to a JSON file and record them in one go. A decision that the evidence cannot carry is refused, and then nothing is written.

```json
[
  { "id": "2.4.6", "status": "supports", "by": "agent", "evidence": "Read facts.headings and facts.fields of all 27 states: each heading names its section, each field its content." },
  { "id": "1.1.1", "status": "partially-supports", "by": "agent", "remarks": "Icons in the attachment grid have no text alternative.", "evidence": "org-attachments: 3 file-type icons are img with no name (tree.yml); the other 26 states pass.", "where": ["org-attachments"] },
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
