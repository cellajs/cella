import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { type Decision, recordDecisions } from './ledger.ts';

/**
 * Records a reviewer's decision on criteria the audit leaves open.
 *
 * Usage:
 *   pnpm -C a11y decide --id 2.4.6 --status supports --by human --evidence "Read the headings of all 27 states."
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

const statuses = ['supports', 'partially-supports', 'does-not-support', 'not-applicable', 'open'];
const decisions: Decision[] = values.file
  ? (JSON.parse(readFileSync(values.file, 'utf8')) as Decision[])
  : [{ ...values, where: values.where?.split(',') } as unknown as Decision];

try {
  for (const decision of decisions) {
    if (!decision.id || !statuses.includes(decision.status))
      throw new Error(`${decision.id ?? 'A decision'} needs --id and --status (${statuses.join(', ')}).`);
    if (decision.by !== 'agent' && decision.by !== 'human') throw new Error(`${decision.id} needs --by agent or --by human.`);
    if (!decision.evidence) throw new Error(`${decision.id} needs --evidence.`);
  }
  const ledger = recordDecisions(decisions);
  const count = (by: string) => ledger.criteria.filter((row) => row.decidedBy === by).length;
  console.info(
    `Recorded ${decisions.length}. Decided by the audit: ${count('audit')}, by an agent: ${count('agent')}, by a person: ${count('human')}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
