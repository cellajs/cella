import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type Criterion, criteria } from './criteria.ts';
import { repoRoot } from './session.ts';

type Status = 'supports' | 'partially-supports' | 'does-not-support' | 'not-applicable';

/** One finding for one criterion. `review` means a tool could not decide and a person has to look. */
export interface Evidence {
  check: string;
  result: 'pass' | 'fail' | 'review' | 'not-applicable';
  /** What was checked or found, in a sentence. */
  summary: string;
  /** Scope states (or files) that failed or need review; empty for a pass, whose summary gives the count. */
  where: string[];
}

export interface LedgerRow {
  id: string;
  name: string;
  level: 'A' | 'AA';
  en301549: string | null;
  status: Status | null;
  /** Reader-facing text for the VPAT's "Remarks and Explanations" column. */
  remarks: string;
  decidedBy: 'audit' | 'human' | null;
  /** Checks the audit could not complete, such as `manual`. */
  open: string[];
  evidence: Evidence[];
}

export interface Ledger {
  edition: string;
  standard: string;
  auditedAt: string;
  scope: string[];
  criteria: LedgerRow[];
}

export const ledgerPath = path.join(repoRoot, 'json/accessibility-conformance.json');

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

function readLedger(): Ledger | null {
  if (!existsSync(ledgerPath)) return null;
  return JSON.parse(readFileSync(ledgerPath, 'utf8')) as Ledger;
}

/** The family a check belongs to: `axe`, `probe` or `code`. */
const family = (check: string) => check.split(':')[0];

/**
 * Builds the ledger from fresh evidence for the check families that ran (`axe`, `probe`, `code`); evidence of the other
 * families carries over from the previous ledger. Rows a person decided keep their status and remarks.
 */
export function writeLedger(evidenceById: Map<string, Evidence[]>, scope: string[], ran: string[], target = ledgerPath) {
  const previous = new Map((readLedger()?.criteria ?? []).map((row) => [row.id, row]));

  const rows = criteria.map((criterion): LedgerRow => {
    const before = previous.get(criterion.id);
    const kept = (before?.evidence ?? []).filter((item) => !ran.includes(family(item.check)));
    const evidence = [...kept, ...(evidenceById.get(criterion.id) ?? [])];
    const decision = before?.decidedBy === 'human' ? { ...decide(criterion, evidence), ...pickHuman(before) } : decide(criterion, evidence);
    return { id: criterion.id, name: criterion.name, level: criterion.level, en301549: criterion.en301549, ...decision, evidence };
  });

  const ledger: Ledger = {
    edition: 'VPAT® 2.5Rev WCAG',
    standard: 'WCAG 2.2 Level AA',
    auditedAt: new Date().toISOString().slice(0, 10),
    scope,
    criteria: rows,
  };
  writeFileSync(target, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

const pickHuman = (row: LedgerRow) => ({ status: row.status, remarks: row.remarks, decidedBy: row.decidedBy, open: [] });
