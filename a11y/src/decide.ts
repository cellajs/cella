import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { parseDecision, recordDecisions } from './ledger.ts';

/**
 * Records a reviewer's decision on criteria the audit leaves open.
 *
 * Usage:
 *   pnpm -C a11y decide --id 2.4.6 --status supports --by human --evidence "Read the headings of all 26 states."
 *   pnpm -C a11y decide --file decisions.json     an array of { id, status, by, remarks?, evidence, where? }
 *
 * Status: supports | partially-supports | does-not-support | not-applicable | open (a finding, no decision).
 */
const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    id: { type: 'string' },
    status: { type: 'string' },
    by: { type: 'string' },
    remarks: { type: 'string' },
    evidence: { type: 'string' },
    where: { type: 'string' },
  },
});

try {
  const input: unknown = values.file ? JSON.parse(readFileSync(values.file, 'utf8')) : [{ ...values, where: values.where?.split(',') }];
  if (!Array.isArray(input)) throw new Error(`${values.file} holds no list of decisions.`);
  const decisions = input.map(parseDecision);
  const ledger = recordDecisions(decisions);
  const count = (by: string) => ledger.criteria.filter((row) => row.decidedBy === by).length;
  console.info(
    `Recorded ${decisions.length}. Decided by the audit: ${count('audit')}, by an agent: ${count('agent')}, by a person: ${count('human')}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
