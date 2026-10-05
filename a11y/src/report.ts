import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { appConfig } from 'shared';
import { manualSteps, screenReaderSteps } from './criteria.ts';
import { type LedgerRow, product, readLedger } from './ledger.ts';
import { repoRoot } from './session.ts';

/**
 * Renders the ledger as a VPAT® 2.5Rev WCAG report (Markdown, HTML and a tagged PDF), plus the checklist for the manual
 * pass. While rows are open or decided by an agent only, the report is a draft and says so.
 *
 * Usage: pnpm -C a11y report                     the draft and the checklist, in a11y/results/
 *        pnpm -C a11y report --publish           refuses a draft; puts the PDF where the app serves it and prints what
 *                                                the accessibility statement needs
 *        pnpm -C a11y report --publish --draft   the same for a draft: the statement then calls the results provisional
 */
const ledger = readLedger();
if (!ledger) {
  console.error(`No ledger for ${product} yet: run \`pnpm a11y\` first.`);
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string };
const resultsDir = path.join(import.meta.dirname, '../results');

const statusLabel: Record<string, string> = {
  supports: 'Supports',
  'partially-supports': 'Partially Supports',
  'does-not-support': 'Does Not Support',
  'not-applicable': 'Not Applicable',
};

/** The audit's own evidence on a row, without a reviewer's findings. */
const automated = (r: LedgerRow) => r.evidence.filter((e) => !e.check.startsWith('review:'));

/** Text made safe for a Markdown table cell; backslashes first, so the escapes added after them stay intact. */
const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ');

/** A row's remarks for the reader; a failing row also names what the audit found. */
function remarksOf(r: LedgerRow) {
  const failures = automated(r)
    .filter((e) => e.result === 'fail')
    .map((e) => e.summary);
  return r.status === 'partially-supports' && failures.length ? `${r.remarks} ${failures.join(' ')}` : r.remarks;
}

function row(r: LedgerRow) {
  // An agent's decision is provisional until a person confirms it; the draft says so on the row
  const provisional = r.decidedBy === 'agent' ? ' *(agent review, to confirm)*' : '';
  const conformance = r.status ? `Web: ${statusLabel[r.status]}${provisional}` : '**Not evaluated yet**';
  const en = r.en301549 ? `<br>EN 301 549: ${r.en301549}` : '';
  return `| ${r.id} ${r.name} (Level ${r.level})${en} | ${conformance} | ${cell(remarksOf(r))} |`;
}

const table = (level: 'A' | 'AA') =>
  [
    '| Criteria | Conformance Level | Remarks and Explanations |',
    '| --- | --- | --- |',
    ...ledger.criteria.filter((r) => r.level === level).map(row),
  ].join('\n');

const open = ledger.criteria.filter((r) => !r.status);
const byAgent = ledger.criteria.filter((r) => r.decidedBy === 'agent');
const byPerson = ledger.criteria.filter((r) => r.decidedBy === 'human');
const unconfirmed = open.length + byAgent.length;

/** What keeps the report a draft, for its reader. */
const draftNote = [
  open.length ? `${open.length} criteria are not evaluated yet.` : '',
  byAgent.length ? `${byAgent.length} criteria were decided by an AI agent and await confirmation by a person.` : '',
]
  .filter(Boolean)
  .join(' ');

const vpat = `# ${appConfig.name} Accessibility Conformance Report

WCAG Edition (Based on VPAT® Version 2.5Rev)

${unconfirmed ? `> **Draft.** ${draftNote} Those rows are marked and can still change.\n` : ''}
**Name of Product/Version:** ${appConfig.name} ${version}

**Report Date:** ${ledger.auditedAt}

**Product Description:** ${appConfig.description}

**Contact Information:** ${appConfig.company.supportEmail}

**Notes:** The report covers the website, the documentation and the signed-in app at ${appConfig.frontendUrl}: ${ledger.scope.length} pages and states, each in light and dark mode.${
  ledger.contrast === 'more'
    ? ' Measured with increased contrast turned on. This is a user setting, not the default: it is switched on under Preferences, and follows the operating system for anyone who asks for more contrast there. With it off, the edges of form fields, buttons and separators are drawn more lightly than 1.4.11 requires.'
    : ''
}

**Evaluation Methods Used:** Automated testing with axe-core on every page and state. Scripted browser checks for reflow at 320px, 200% zoom, text spacing, orientation, keyboard focus (visibility, obscuring, order inside overlays, Escape), page titles, landmarks, page language, form errors and input purpose. Source review for media, motion, keyboard shortcuts, time limits, gestures and sign-in methods. ${
  byAgent.length
    ? `Review of ${byAgent.length} criteria by an AI agent from screenshots, the accessibility tree and the source, each decision recorded with its evidence. `
    : ''
}${byPerson.length ? `Manual review of ${byPerson.length} criteria by a person.` : 'Manual testing by a person, including screen readers: not yet done.'}

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

/** Files a reviewer's evidence names that changed after the day of the decision: the decision may describe old code. */
const tracked = spawnSync('git', ['ls-files', 'frontend/src', 'backend/src', 'locales'], { cwd: repoRoot, encoding: 'utf8' }).stdout.split('\n');
function changedSince(r: LedgerRow) {
  const review = r.evidence.find((e) => e.check === `review:${r.decidedBy}`);
  if (!review?.date) return [];
  const cited = new Set(review.summary.match(/[\w./-]+\.(?:tsx?|css|json)\b/g) ?? []);
  const files = [...cited].flatMap((name) => tracked.filter((file) => file.endsWith(`/${name}`)).slice(0, 1));
  return files.filter((file) =>
    spawnSync('git', ['log', '-1', `--since=${review.date}T23:59:59`, '--format=%h', '--', file], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim(),
  );
}
const stale = ledger.criteria
  .filter((r) => r.decidedBy === 'agent' || r.decidedBy === 'human')
  .map((r) => ({ row: r, files: changedSince(r) }))
  .filter(({ files }) => files.length);

const failing = ledger.criteria.filter((r) => r.status === 'partially-supports' || r.status === 'does-not-support');
const step = (id: string) => manualSteps[id] ?? (id.startsWith('1.2.') ? manualSteps['1.2.1'] : undefined);

const checklist = `# Manual accessibility pass

Record a decision with \`pnpm -C a11y decide --id <criterion> --status <status> --by human --evidence "<what you checked>"\`
(add \`--remarks\` for the report reader unless the status is supports). Test with VoiceOver and Safari on macOS and with
NVDA and Firefox on Windows, keyboard only, in light and dark mode.

## Confirm: decided by an agent (${byAgent.length})

The agent judged these from the review packets in \`a11y/results/review/\`. Check its evidence, then record your own
decision; a wrong Supports here ends up in the published report.

${byAgent
  .map((r) => {
    const review = r.evidence.find((e) => e.check === 'review:agent');
    return [
      `- [ ] **${r.id} ${r.name}** (${r.level}): ${statusLabel[r.status ?? '']}${r.remarks ? `. ${r.remarks}` : ''}`,
      `  - Agent's evidence (${review?.date}): ${review?.summary}`,
    ].join('\n');
  })
  .join('\n')}

## Re-check: code changed since the decision (${stale.length})

A reviewer's decision outlives the code it describes. For each row, look at the named files again and record the decision anew.

${stale.map(({ row, files }) => `- [ ] **${row.id} ${row.name}**: ${files.join(', ')}`).join('\n')}

## Screen reader pass (4.1.2 and 4.1.3)

Go through each page type and overlay of the scope with a screen reader on, and listen for:

${screenReaderSteps.map((line) => `- [ ] ${line}`).join('\n')}

Name in the decision which screen readers and browsers you used; the report lists only those.

## Open criteria (${open.length})

${open
  .map((r) => {
    const needsPerson = r.open.some((check) => check === 'manual' || check === 'review');
    const what = needsPerson ? (step(r.id) ?? 'Check the criterion by hand.') : `Run the full audit; these checks did not run: ${r.open.join(', ')}.`;
    const notes = r.evidence
      .filter((e) => e.result === 'review')
      .map((e) => `  - ${e.check === 'review:agent' ? 'Agent note' : 'Tool note'}: ${e.summary}`);
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

/** The report's Markdown as an HTML document: headings, paragraphs, a quote, lists and tables with header cells. */
function toHtml(markdown: string) {
  const inline = (text: string) =>
    text
      .replace(/&(?!lt;|gt;|amp;)/g, '&amp;')
      .replace(/<(?!br>)/g, '&lt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*\((.+?)\)\*/g, '<em>($1)</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  const cells = (line: string) =>
    line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((value) => inline(value.trim().replace(/\\\|/g, '|').replace(/\\\\/g, '\\')));
  const body: string[] = [];
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) body.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    else if (line.startsWith('| ')) {
      const head = cells(line);
      const rows: string[] = [];
      for (i += 2; i < lines.length && lines[i].startsWith('| '); i++) {
        const [first, ...rest] = cells(lines[i]);
        rows.push(`<tr><th scope="row">${first}</th>${rest.map((value) => `<td>${value}</td>`).join('')}</tr>`);
      }
      i -= 1;
      body.push(
        `<table><thead><tr>${head.map((value) => `<th scope="col">${value}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`,
      );
    } else if (line.startsWith('- ')) {
      const items: string[] = [];
      for (; i < lines.length && lines[i].startsWith('- '); i++) items.push(`<li>${inline(lines[i].slice(2))}</li>`);
      i -= 1;
      body.push(`<ul>${items.join('')}</ul>`);
    } else if (line.startsWith('> ')) body.push(`<p class="note">${inline(line.slice(2))}</p>`);
    else if (line.trim()) body.push(`<p>${inline(line)}</p>`);
  }
  const style =
    'body{font:11pt/1.45 system-ui,sans-serif;color:#111;margin:0}h1{font-size:20pt}h2{font-size:14pt;margin-top:1.6em}h3{font-size:12pt}' +
    'table{border-collapse:collapse;width:100%;margin:.6em 0}th,td{border:1px solid #777;padding:5px 7px;text-align:left;vertical-align:top;font-size:9.5pt}' +
    'thead th{background:#eee}tbody th{font-weight:600;width:27%}td:nth-child(2){width:19%}.note{border-left:4px solid #b45309;padding-left:10px}tr{break-inside:avoid}';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${appConfig.name} Accessibility Conformance Report</title><style>${style}</style></head><body>${body.join('\n')}</body></html>`;
}

mkdirSync(resultsDir, { recursive: true });
writeFileSync(path.join(resultsDir, 'vpat-draft.md'), vpat);
writeFileSync(path.join(resultsDir, 'manual-pass.md'), checklist);

// The same report as a document and as a tagged PDF with an outline, which a screen reader can navigate by heading and table
const html = toHtml(vpat);
const pdfPath = path.join(resultsDir, 'conformance-report.pdf');
writeFileSync(path.join(resultsDir, 'conformance-report.html'), html);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: pdfPath, format: 'A4', tagged: true, outline: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } });
} finally {
  await browser.close();
}

if (process.argv.includes('--publish')) {
  // Only what a person confirmed is published as final: an open row has no answer, and an agent's answer is provisional
  if (unconfirmed && !process.argv.includes('--draft')) {
    const ids = [...open, ...byAgent].map((r) => r.id).join(', ');
    console.error(
      `Not published: ${open.length} criteria are open and ${byAgent.length} are decided by an agent only (${ids}). See a11y/results/manual-pass.md, or add --draft to publish it as a draft.`,
    );
    process.exit(1);
  }
  // Under static/common: that folder is the app's own, so one product's report never syncs into another
  const publicPath = 'frontend/public/static/common/accessibility-conformance-report.pdf';
  mkdirSync(path.dirname(path.join(repoRoot, publicPath)), { recursive: true });
  copyFileSync(pdfPath, path.join(repoRoot, publicPath));
  const count = (status: LedgerRow['status']) => ledger.criteria.filter((r) => r.status === status).length;
  const review = {
    standard: ledger.standard,
    reviewedAt: ledger.auditedAt,
    ...(unconfirmed ? { provisional: true } : {}),
    results: {
      pagesAndStates: ledger.scope.length,
      supports: count('supports'),
      partiallySupports: count('partially-supports'),
      doesNotSupport: count('does-not-support'),
      notApplicable: count('not-applicable'),
      notEvaluated: open.map((r) => `${r.id} ${r.name}`),
    },
    limitations: failing.map((r) => ({ description: remarksOf(r), criteria: [r.id] })),
    report: { edition: ledger.edition, date: ledger.auditedAt, pdfUrl: publicPath.replace('frontend/public', '') },
  };
  console.info(
    `Published ${publicPath}${unconfirmed ? ' as a draft' : ''}.\nPut this in frontend/src/modules/auth/legal/legal-config.ts, and shorten each description for the statement's reader:\n`,
  );
  console.info(`export const accessibilityReview: AccessibilityReview = ${JSON.stringify(review, null, 2)};\n`);
}
console.info(
  `Wrote ${path.relative(process.cwd(), resultsDir)}/vpat-draft.md, conformance-report.html, conformance-report.pdf and manual-pass.md (${open.length} criteria open, ${byAgent.length} decided by an agent).`,
);
