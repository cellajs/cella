import { readFileSync } from 'node:fs';
import path from 'node:path';
import { actionLabel, isOperatorActionId, menuRows, operatorActions, taskNames } from '@cellajs/cli/infra/contract';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

const labels = Object.keys(operatorActions).filter(isOperatorActionId).map(actionLabel);
const rowLabels = Object.values(menuRows).map((row) => row.label);
const tasks = new Set(taskNames);

/** The template's docs that walk an operator through the infra CLI; the engine checks its own docs against the same table. */
const DOCS = [
  'cella/docs/DEPLOYMENT.md',
  'cella/docs/deployment/FRESH_INSTALLATION.md',
  'cella/docs/deployment/KEYS.md',
  'cella/docs/deployment/CHANGING_INFRASTRUCTURE.md',
  'cella/docs/deployment/RUNBOOKS.md',
  'infra/README.md',
];

describe('the docs name the infra CLI as the engine does', () => {
  it('points the docs at menu entries and commands that exist', () => {
    const known = new Set<string>([...labels, ...rowLabels]);
    const unknown: string[] = [];
    for (const file of DOCS) {
      const text = readFileSync(path.join(repoRoot, file), 'utf8');
      // `pnpm cella infra` → **Row** (→ **Action**), and the command forms `pnpm cella infra <action>` and `pnpm cella infra <task>`.
      for (const match of text.matchAll(/`pnpm cella infra` → \*\*([^*]+)\*\*(?: → \*\*([^*]+)\*\*)?/g)) {
        for (const name of [match[1], match[2]]) if (name && !known.has(name)) unknown.push(`${file}: ${name}`);
      }
      for (const match of text.matchAll(/pnpm cella infra ([a-z][a-z-]*)/g)) {
        const word = match[1] ?? '';
        if (word !== 'help' && !isOperatorActionId(word) && !tasks.has(word)) unknown.push(`${file}: pnpm cella infra ${word}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});
