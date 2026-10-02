import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { appConfig } from 'shared';
import { manualSteps } from './criteria.ts';
import { type Ledger, type LedgerRow, ledgerPath } from './ledger.ts';
import { repoRoot } from './session.ts';

/**
 * Renders the ledger as a draft VPAT® 2.5Rev WCAG report, plus the checklist for the manual pass.
 *
 * Usage: pnpm -C a11y report
 */
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Ledger;
const { version } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string };
const resultsDir = path.join(import.meta.dirname, '../results');

const statusLabel: Record<string, string> = {
  supports: 'Supports',
  'partially-supports': 'Partially Supports',
  'does-not-support': 'Does Not Support',
  'not-applicable': 'Not Applicable',
};

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ');

function row(r: LedgerRow) {
  const conformance = r.status ? `Web: ${statusLabel[r.status]}` : `**Open** (${r.open.join(', ')})`;
  const failures = r.evidence.filter((e) => e.result === 'fail').map((e) => e.summary);
  const remarks = r.status === 'partially-supports' && failures.length ? `${r.remarks} ${failures.join(' ')}` : r.remarks;
  const en = r.en301549 ? `<br>EN 301 549: ${r.en301549}` : '';
  return `| ${r.id} ${r.name} (Level ${r.level})${en} | ${conformance} | ${cell(remarks)} |`;
}

const table = (level: 'A' | 'AA') =>
  [
    '| Criteria | Conformance Level | Remarks and Explanations |',
    '| --- | --- | --- |',
    ...ledger.criteria.filter((r) => r.level === level).map(row),
  ].join('\n');

const open = ledger.criteria.filter((r) => !r.status);

const vpat = `# ${appConfig.name} Accessibility Conformance Report

WCAG Edition (Based on VPAT® Version 2.5Rev)

> **Draft.** Generated from \`json/accessibility-conformance.json\` on ${ledger.auditedAt}. ${open.length} criteria are still open
> and need the manual pass before this report can be published.

**Name of Product/Version:** ${appConfig.name} ${version}

**Report Date:** ${ledger.auditedAt}

**Product Description:** ${appConfig.description}

**Contact Information:** ${appConfig.company.supportEmail}

**Notes:** The report covers the website, the documentation and the signed-in app at ${appConfig.frontendUrl}: ${ledger.scope.length} pages and states, each in light and dark mode.

**Evaluation Methods Used:** Automated testing with axe-core on every page and state. Scripted browser checks for reflow at 320px, 200% zoom, text spacing, orientation, keyboard focus (visibility, obscuring, order inside overlays, Escape), page titles, landmarks, page language, form errors and input purpose. Source review for media, motion, keyboard shortcuts, time limits, gestures and sign-in methods. Manual testing with screen readers: not yet done.

## Applicable Standards/Guidelines

| Standard/Guideline | Included In Report |
| --- | --- |
| Web Content Accessibility Guidelines 2.0 | Level A (Yes), Level AA (Yes), Level AAA (No) |
| Web Content Accessibility Guidelines 2.1 | Level A (Yes), Level AA (Yes), Level AAA (No) |
| Web Content Accessibility Guidelines 2.2 | Level A (Yes), Level AA (Yes), Level AAA (No) |

## Terms

- **Supports:** The functionality of the product has at least one method that meets the criterion without known defects or meets with equivalent facilitation.
- **Partially Supports:** Some functionality of the product does not meet the criterion.
- **Does Not Support:** The majority of product functionality does not meet the criterion.
- **Not Applicable:** The criterion is not relevant to the product.
- **Not Evaluated:** The product has not been evaluated against the criterion. This can only be used in WCAG Level AAA criteria.

## WCAG 2.x Report

### Table 1: Success Criteria, Level A

${table('A')}

### Table 2: Success Criteria, Level AA

${table('AA')}

### Table 3: Success Criteria, Level AAA

Not evaluated.

## Legal Disclaimer (${appConfig.company.name})

This report describes the product as tested on the report date. Accessibility can change as the product changes.
`;

const failing = ledger.criteria.filter((r) => r.status === 'partially-supports' || r.status === 'does-not-support');
const step = (id: string) => manualSteps[id] ?? (id.startsWith('1.2.') ? manualSteps['1.2.1'] : undefined);

const checklist = `# Manual accessibility pass

Record each decision in \`json/accessibility-conformance.json\`: set \`status\`, write \`remarks\` for the reader, and set
\`decidedBy\` to \`"human"\` so the next audit keeps it. Test with VoiceOver and Safari on macOS and with NVDA and Firefox
on Windows, keyboard only, in light and dark mode.

## Open criteria (${open.length})

${open
  .map((r) => {
    const needsPerson = r.open.some((check) => check === 'manual' || check === 'review');
    const what = needsPerson ? (step(r.id) ?? 'Check the criterion by hand.') : `Run the full audit; these checks did not run: ${r.open.join(', ')}.`;
    const notes = r.evidence.filter((e) => e.result === 'review').map((e) => `  - Tool note: ${e.summary}`);
    return [`- [ ] **${r.id} ${r.name}** (${r.level}): ${what}`, ...notes].join('\n');
  })
  .join('\n')}

## Failures to fix or describe (${failing.length})

Each needs a fix, or a remark that tells the reader what does not work and how to get around it.

${failing
  .map((r) => {
    const fails = r.evidence.filter((e) => e.result === 'fail').map((e) => `  - ${e.summary}`);
    return [`- [ ] **${r.id} ${r.name}** (${r.level})`, ...fails].join('\n');
  })
  .join('\n')}
`;

writeFileSync(path.join(resultsDir, 'vpat-draft.md'), vpat);
writeFileSync(path.join(resultsDir, 'manual-pass.md'), checklist);
console.info(`Wrote ${path.relative(process.cwd(), resultsDir)}/vpat-draft.md and manual-pass.md (${open.length} criteria open).`);
