import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { defaultAdminUser } from '../../backend/scripts/fixtures.ts';
import { type AxeScan, summarizeAxe } from './axe-scan.ts';
import { runCodeChecks } from './code-checks.ts';
import { EvidenceSet, type Finding } from './findings.ts';
import { ledgerPath, writeLedger } from './ledger.ts';
import { acrossStates } from './probes/page-structure.ts';
import { scope } from './scope.ts';
import { baseUrl, type Mode, repoRoot, startSession } from './session.ts';
import { visitState } from './visit.ts';

/**
 * Audits the running development app against WCAG 2.2 A/AA and writes the conformance ledger.
 *
 * Usage: pnpm a11y [--email <admin email>] [--states id,id] [--only axe,probes,code] [--workers 4]
 */
const { values } = parseArgs({
  options: {
    email: { type: 'string', default: process.env.ADMIN_EMAIL ?? defaultAdminUser.email },
    states: { type: 'string' },
    only: { type: 'string', default: 'axe,probes,code' },
    workers: { type: 'string', default: '4' },
  },
});
const only = values.only.split(',');
const parts = { axe: only.includes('axe'), probes: only.includes('probes'), code: only.includes('code') };

const startedAt = Date.now();
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)}s`;
const resultsDir = path.join(import.meta.dirname, '../results');

const health = await fetch(`${baseUrl}/api/health`).catch(() => null);
if (!health?.ok) {
  console.error(`The app is not reachable at ${baseUrl}. Start it with \`pnpm offline\` (or \`pnpm dev\`) on a seeded database and run again.`);
  process.exit(1);
}
// A build is as old as its last `vite build`: say so, since a stale one audits old code without a sign
const isDevServer = (await (await fetch(baseUrl)).text()).includes('/@vite/client');
const builtAt = isDevServer ? null : statSync(path.join(repoRoot, 'frontend/dist/index.html'), { throwIfNoEntry: false })?.mtime;
console.info(`Auditing ${baseUrl}: ${isDevServer ? 'dev server' : `frontend build of ${builtAt?.toLocaleString() ?? 'unknown date'}`}.`);

const chosen = values.states?.split(',');
const states = chosen ? scope.filter((state) => chosen.includes(state.id)) : scope;
const session = await startSession(values.email);

const findings: Finding[] = [];
const scans: AxeScan[] = [];
const errors: Record<string, string> = {};

/** One visit: a state in a color mode. Dark visits exist for axe's contrast rule only. */
const visits: { state: (typeof states)[number]; mode: Mode }[] = [];
if (parts.axe || parts.probes) for (const state of states) visits.push({ state, mode: 'light' });
if (parts.axe) for (const state of states) visits.push({ state, mode: 'dark' });

/** Takes visits from the shared queue until it is empty. */
const worker = async () => {
  for (let visit = visits.shift(); visit; visit = visits.shift()) {
    const { state, mode } = visit;
    const visitStartedAt = Date.now();
    try {
      const result = await visitState(session, state, mode, parts);
      findings.push(...result.findings);
      if (result.scan) scans.push(result.scan);
      console.info(`${state.id} (${mode}) ${seconds(visitStartedAt)}`);
    } catch (error) {
      errors[`${state.id} (${mode})`] = error instanceof Error ? error.message.split('\n')[0] : String(error);
      console.warn(`${state.id} (${mode}) skipped: ${errors[`${state.id} (${mode})`]}`);
    }
  }
};

try {
  await Promise.all(Array.from({ length: Number(values.workers) }, worker));
} finally {
  await session.browser.close();
}

// Visits finish in any order; scope order keeps the ledger stable between runs
const position = (label: string) => scope.findIndex((state) => label === state.id || label.startsWith(`${state.id} (`));
findings.sort((a, b) => position(a.state) - position(b.state));
scans.sort((a, b) => Number(a.where.endsWith('(dark)')) - Number(b.where.endsWith('(dark)')) || position(a.where) - position(b.where));

const evidence = new EvidenceSet();
mkdirSync(resultsDir, { recursive: true });
if (parts.axe) {
  const axe = summarizeAxe(scans);
  for (const [id, items] of axe.evidence) for (const item of items) evidence.add([id], item);
  writeFileSync(path.join(resultsDir, 'axe.json'), `${JSON.stringify({ ...axe.report, errors }, null, 2)}\n`);
}
if (parts.probes) evidence.addFindings(acrossStates(findings));
if (parts.code) runCodeChecks(evidence);

// The ledger describes the whole scope, so a run that covered only part of it writes a separate file
const skipped = Object.keys(errors).length;
const target = chosen || skipped ? path.join(resultsDir, 'ledger-partial.json') : ledgerPath;
const families = only.map((part) => (part === 'probes' ? 'probe' : part));
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
console.info(`Done in ${seconds(startedAt)}${skipped ? `, ${skipped} visits skipped` : ''}.`);
if (skipped) process.exitCode = 1;
