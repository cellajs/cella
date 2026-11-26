import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  actionLabel,
  isOperatorActionId,
  type MenuRowId,
  menuRow,
  menuRows,
  type OperatorActionId,
  operatorActions,
} from '@cellajs/cli/infra/contract';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

const ids = Object.keys(operatorActions) as OperatorActionId[];
const rowIds = Object.keys(menuRows) as MenuRowId[];
const labels = ids.map(actionLabel);
const rowLabels = rowIds.map((id) => menuRow(id).label);

/** Names an action or a submenu carried before the flat menu. None may come back in the docs. */
const RETIRED_LABELS = [
  'Open temporary public DB access',
  'Expose database publicly',
  'Stop public DB exposure',
  'Public DB access: OPEN',
  'Apply infra change',
  'Apply changes',
  'Store passphrase in keychain',
  'Rotate passphrase',
  'Recovery passphrase',
  'recovery passphrase',
  'Manage keys & secrets',
  'Manage database',
  'Set up operator key',
  'Stack setup →',
  '"Stack setup"',
  'Show status',
  'Show runs',
  'Manage runtime secrets',
  'Open public DB access',
  'Close public DB access',
  'Rotate keys & secrets',
  'Repair stack',
  'Tear down stack',
  'Unlock stack',
  'Start a deploy',
  'Keys & operators',
  'Operators & keys',
  'Infrastructure changes',
];

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
  it('keeps retired labels out of the docs', () => {
    const hits = DOCS.flatMap((file) => {
      const text = readFileSync(path.join(repoRoot, file), 'utf8');
      return RETIRED_LABELS.filter((label) => text.includes(label)).map((label) => `${file}: ${label}`);
    });
    expect(hits).toEqual([]);
  });

  it('points the docs at menu entries and commands that exist', () => {
    const known = new Set<string>([...labels, ...rowLabels]);
    const unknown: string[] = [];
    for (const file of DOCS) {
      const text = readFileSync(path.join(repoRoot, file), 'utf8');
      // `pnpm cella infra` → **Row** (→ **Action**), and the command form `pnpm cella infra <action>`.
      for (const match of text.matchAll(/`pnpm cella infra` → \*\*([^*]+)\*\*(?: → \*\*([^*]+)\*\*)?/g)) {
        for (const name of [match[1], match[2]]) if (name && !known.has(name)) unknown.push(`${file}: ${name}`);
      }
      for (const match of text.matchAll(/pnpm cella infra ([a-z][a-z-]*)/g)) {
        const word = match[1] ?? '';
        if (word !== 'help' && !isOperatorActionId(word)) unknown.push(`${file}: pnpm cella infra ${word}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});
