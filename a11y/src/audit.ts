import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { defaultAdminUser } from '../../backend/scripts/fixtures.ts';
import { runAxe } from './axe-scan.ts';
import { runCodeChecks } from './code-checks.ts';
import { ledgerPath, writeLedger } from './ledger.ts';
import { probeForms } from './probes/forms.ts';
import { probeKeyboard } from './probes/keyboard.ts';
import { probeLayout } from './probes/layout.ts';
import { probeOverlays } from './probes/overlays.ts';
import { probePageStructure } from './probes/page-structure.ts';
import { EvidenceSet } from './probes/visit.ts';
import { scope } from './scope.ts';
import { baseUrl, startSession } from './session.ts';

/**
 * Audits the running development app against WCAG 2.2 A/AA and writes the conformance ledger.
 *
 * Usage: pnpm a11y [--email <admin email>] [--states id,id] [--only axe,probes,code]
 */
const { values } = parseArgs({
  options: {
    email: { type: 'string', default: process.env.ADMIN_EMAIL ?? defaultAdminUser.email },
    states: { type: 'string' },
    only: { type: 'string', default: 'axe,probes,code' },
  },
});
const parts = values.only.split(',');

const resultsDir = path.join(import.meta.dirname, '../results');
const log = (line: string) => console.info(line);

const health = await fetch(`${baseUrl}/api/health`).catch(() => null);
if (!health?.ok) {
  console.error(`The app is not reachable at ${baseUrl}. Start it with \`pnpm dev\` (seeded database) and run again.`);
  process.exit(1);
}

const only = values.states?.split(',');
const states = only ? scope.filter((state) => only.includes(state.id)) : scope;
const session = await startSession(values.email);

const evidence = new EvidenceSet();
mkdirSync(resultsDir, { recursive: true });

try {
  if (parts.includes('axe')) {
    const axe = await runAxe(session, states, log);
    for (const [id, items] of axe.evidence) for (const item of items) evidence.add([id], item);
    writeFileSync(path.join(resultsDir, 'axe.json'), `${JSON.stringify(axe.report, null, 2)}\n`);
  }
  if (parts.includes('probes')) {
    for (const [name, probe] of [
      ['page structure', probePageStructure],
      ['layout', probeLayout],
      ['keyboard', probeKeyboard],
      ['forms', probeForms],
      ['overlays', probeOverlays],
    ] as const) {
      log(`probe ${name}`);
      await probe(session, states, evidence);
    }
  }
  if (parts.includes('code')) runCodeChecks(evidence);
} finally {
  await session.browser.close();
}

// The ledger describes the whole scope, so a run over some states writes a separate file
const target = only ? path.join(resultsDir, 'ledger-partial.json') : ledgerPath;
const families = parts.map((part) => (part === 'probes' ? 'probe' : part));
const ledger = writeLedger(
  evidence.byCriterion,
  states.map((state) => state.id),
  families,
  target,
);

const count = (status: string | null) => ledger.criteria.filter((row) => row.status === status).length;
console.info(
  `\n${ledger.criteria.length} criteria: ${count('supports')} supports, ${count('partially-supports')} partially supports, ` +
    `${count('not-applicable')} not applicable, ${count(null)} open.`,
);
for (const row of ledger.criteria.filter((r) => r.status === 'partially-supports')) {
  console.info(
    `  ${row.id} ${row.name}: ${row.evidence
      .filter((e) => e.result === 'fail')
      .map((e) => e.summary)
      .join(' ')}`,
  );
}
console.info(`\nLedger: ${path.relative(process.cwd(), target)}. Raw findings: ${path.relative(process.cwd(), resultsDir)}/`);
