import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type Criterion, criteria } from './criteria.ts';
import { repoRoot } from './session.ts';

type Status = 'supports' | 'partially-supports' | 'does-not-support' | 'not-applicable';

/** Who may decide a row that the audit leaves open. An agent's decision stands until a person confirms or changes it. */
type Reviewer = 'agent' | 'human';

/** One finding for one criterion. `review` means a tool could not decide and a reviewer has to look. */
export interface Evidence {
  /** `axe`, `probe:<name>`, `code:<name>`, or `review:agent` / `review:human` for a reviewer's own finding. */
  check: string;
  result: 'pass' | 'fail' | 'review' | 'not-applicable';
  /** What was checked or found, in a sentence. */
  summary: string;
  /** Scope states (or files) that failed or need review; empty for a pass, whose summary gives the count. */
  where: string[];
  /** Day a reviewer made the finding; the audit's own evidence is as fresh as the ledger's `auditedAt`. */
  date?: string;
}

export interface LedgerRow {
  id: string;
  name: string;
  level: 'A' | 'AA';
  en301549: string | null;
  status: Status | null;
  /** Reader-facing text for the VPAT's "Remarks and Explanations" column. */
  remarks: string;
  decidedBy: 'audit' | Reviewer | null;
  /** Checks the audit could not complete, such as `manual`. */
  open: string[];
  evidence: Evidence[];
}

export interface Ledger {
  /** Name of the app the results are about. A ledger of another app (a fresh scaffold carries the template's) is never read. */
  product: string;
  edition: string;
  standard: string;
  auditedAt: string;
  scope: string[];
  criteria: LedgerRow[];
}

export const ledgerPath = path.join(repoRoot, 'json/accessibility-conformance.json');

/** The root package name: the same in every mode, where the config slug differs between development and production. */
export const product = (JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { name: string }).name;

/**
 * Decides a row from its evidence. Any failure makes it Partially Supports; only rows whose checks all ran and passed
 * become Supports. Everything else stays undecided with the open checks listed.
 */
function decide(criterion: Criterion, evidence: Evidence[]): Pick<LedgerRow, 'status' | 'remarks' | 'decidedBy' | 'open'> {
  const ran = new Set(evidence.map((e) => e.check));
  const open: string[] = criterion.checks.filter((check) => check === 'manual' || !ran.has(check));
  if (evidence.some((e) => e.result === 'review')) open.push('review');

  const failures = evidence.filter((e) => e.result === 'fail');
  if (failures.length) {
    const where = [...new Set(failures.flatMap((e) => e.where))];
    return {
      status: 'partially-supports',
      remarks: `Automated checks found failures on ${where.length} of the reviewed pages and states.`,
      decidedBy: 'audit',
      open,
    };
  }
  if (open.length) return { status: null, remarks: '', decidedBy: null, open };
  if (evidence.length && evidence.every((e) => e.result === 'not-applicable')) {
    return { status: 'not-applicable', remarks: evidence.map((e) => e.summary).join(' '), decidedBy: 'audit', open };
  }
  return { status: 'supports', remarks: evidence.map((e) => e.summary).join(' '), decidedBy: 'audit', open };
}

/** This app's ledger, or null when there is none yet or the file holds another app's results. */
export function readLedger(): Ledger | null {
  if (!existsSync(ledgerPath)) return null;
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Ledger;
  return ledger.product === product ? ledger : null;
}

/** The family a check belongs to: `axe`, `probe`, `code` or `review`. */
const family = (check: string) => check.split(':')[0];

/** Evidence the audit produced itself; a reviewer's findings are left out. */
const automated = (evidence: Evidence[]) => evidence.filter((item) => family(item.check) !== 'review');

/**
 * Builds the ledger from fresh evidence for the check families that ran (`axe`, `probe`, `code`); evidence of the other
 * families carries over from the previous ledger. A row a reviewer decided keeps that decision, unless the audit now
 * finds a failure on a row the reviewer called Supports or Not Applicable.
 */
export function writeLedger(evidenceById: Map<string, Evidence[]>, scope: string[], ran: string[], target = ledgerPath) {
  const previous = new Map((readLedger()?.criteria ?? []).map((row) => [row.id, row]));

  const rows = criteria.map((criterion): LedgerRow => {
    const before = previous.get(criterion.id);
    const kept = (before?.evidence ?? []).filter((item) => !ran.includes(family(item.check)));
    const evidence = [...kept, ...(evidenceById.get(criterion.id) ?? [])];
    const byAudit = decide(criterion, automated(evidence));
    const reviewed = before?.decidedBy === 'agent' || before?.decidedBy === 'human';
    const contradicted = byAudit.status === 'partially-supports' && (before?.status === 'supports' || before?.status === 'not-applicable');
    const decision =
      before && reviewed && !contradicted ? { status: before.status, remarks: before.remarks, decidedBy: before.decidedBy, open: [] } : byAudit;
    return { id: criterion.id, name: criterion.name, level: criterion.level, en301549: criterion.en301549, ...decision, evidence };
  });

  const ledger: Ledger = {
    product,
    edition: 'VPAT® 2.5Rev WCAG',
    standard: 'WCAG 2.2 Level AA',
    auditedAt: new Date().toISOString().slice(0, 10),
    scope,
    criteria: rows,
  };
  writeFileSync(target, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

/** A reviewer's decision on one criterion. `open` records a finding and leaves the row undecided. */
export interface Decision {
  id: string;
  status: Status | 'open';
  by: Reviewer;
  /** Reader-facing text for the report; required unless the criterion is supported. */
  remarks?: string;
  /** What the reviewer looked at and found, for whoever checks the decision. */
  evidence: string;
  /** States (or files) the finding is about. */
  where?: string[];
}

/** Records reviewers' decisions in the ledger. Refuses what the evidence cannot carry; nothing is written unless all are valid. */
export function recordDecisions(decisions: Decision[]) {
  const ledger = readLedger();
  if (!ledger) throw new Error(`No ledger for ${product} yet: run \`pnpm a11y\` first.`);

  for (const { id, status, by, remarks = '', evidence, where = [] } of decisions) {
    const row = ledger.criteria.find((candidate) => candidate.id === id);
    if (!row) throw new Error(`${id} is not a WCAG 2.2 A/AA criterion.`);
    if (!evidence.trim()) throw new Error(`${id}: a decision needs its evidence.`);
    if (by === 'agent' && row.decidedBy === 'human') throw new Error(`${id} was decided by a person; only a person changes it.`);
    const passes = status === 'supports' || status === 'not-applicable';
    if (passes && automated(row.evidence).some((item) => item.result === 'fail')) {
      throw new Error(`${id}: the audit found failures, so it cannot be ${status}. Fix them or record what fails.`);
    }
    if (status !== 'supports' && status !== 'open' && !remarks.trim()) throw new Error(`${id}: ${status} needs remarks for the reader.`);

    const result = status === 'open' ? 'review' : status === 'supports' ? 'pass' : status === 'not-applicable' ? 'not-applicable' : 'fail';
    const finding: Evidence = { check: `review:${by}`, result, summary: evidence.trim(), where, date: new Date().toISOString().slice(0, 10) };
    row.evidence = [...row.evidence.filter((item) => item.check !== finding.check), finding];

    if (status !== 'open') Object.assign(row, { status, remarks: remarks.trim(), decidedBy: by, open: [] });
    else if (row.decidedBy === 'agent' || row.decidedBy === 'human')
      Object.assign(row, { status: null, remarks: '', decidedBy: null, open: ['manual'] });
  }

  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}
