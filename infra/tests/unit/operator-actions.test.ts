import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  actionCommand,
  actionDescription,
  actionLabel,
  isOperatorActionId,
  MENU_GROUPS,
  MENU_ROWS,
  type MenuRowId,
  menuPath,
  menuRow,
  OPERATOR_ACTIONS,
  type OperatorActionId,
} from '../../lib/operator-actions';

const infraRoot = path.resolve(import.meta.dirname, '../..');
const repoRoot = path.resolve(infraRoot, '..');

const ids = Object.keys(OPERATOR_ACTIONS) as OperatorActionId[];
const rowIds = Object.keys(MENU_ROWS) as MenuRowId[];
const labels = ids.map(actionLabel);
const rowLabels = rowIds.map((id) => menuRow(id).label);

/** Names an action or a submenu carried before the flat menu. None may come back in a message, a comment or the docs. */
const RETIRED_LABELS = [
  'Open temporary public DB access',
  'Expose database publicly',
  'Stop public DB exposure',
  'Public DB access: OPEN',
  'Apply infra change',
  'Manage keys & secrets',
  'Manage database',
  'Stack setup →',
  '"Stack setup"',
];

const DOCS = ['cella/DEPLOYMENT.md', 'infra/README.md', 'infra/tasks/README.md'];

/** Every TypeScript source file of the infra package, relative to the repo root. */
function infraSources(dir = infraRoot): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return infraSources(full);
    return entry.name.endsWith('.ts') ? [path.relative(repoRoot, full)] : [];
  });
}

describe('operator action table', () => {
  it('gives every action its own label', () => {
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('uses command-shaped ids: lowercase words joined by hyphens', () => {
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(isOperatorActionId('apply')).toBe(true);
    expect(isOperatorActionId('toString')).toBe(false);
    expect(actionCommand('db-close')).toBe('pnpm infra db-close');
  });

  it('ends every description with the key the action runs with', () => {
    expect(actionDescription('apply')).toMatch(/Needs your Owner API key\.$/);
    expect(actionDescription('preview')).toMatch(/Uses the admin application key\.$/);
    expect(actionDescription('status')).toMatch(/Works without a Scaleway key\.$/);
    expect(actionDescription('db-close', 'Delete the stray endpoint.')).toBe('Delete the stray endpoint. Needs your Owner API key.');
  });
});

describe('menu rows', () => {
  it('lists only actions that exist, each in one row', () => {
    const listed = rowIds.flatMap((id) => [...menuRow(id).actions]);
    for (const action of listed) expect(ids).toContain(action);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('keeps the menu to eight rows: the two DB access rows share one place', () => {
    expect(rowIds).toHaveLength(9);
    expect(rowIds).toContain('db-open');
    expect(rowIds).toContain('db-close');
  });

  it('puts every row in a known group', () => {
    for (const id of rowIds) expect(Object.keys(MENU_GROUPS)).toContain(menuRow(id).group);
  });

  it('leaves only the two background actions without a row', () => {
    const listed = new Set(rowIds.flatMap((id) => [...menuRow(id).actions]));
    const commandOnly = ids.filter((id) => !listed.has(id)).sort();
    expect(commandOnly).toHaveLength(2);
    expect(commandOnly[0]).toBe('geoip-refresh');
    expect(commandOnly[1]).toBe('store-passphrase');
  });

  it('says where an action is found: the row, the pick inside a row, or the command', () => {
    expect(menuPath('status')).toBe('Show status');
    expect(menuPath('db-open')).toBe('Open public DB access');
    expect(menuPath('db-close')).toBe('Close public DB access');
    expect(menuPath('db-seed')).toBe('Open public DB access → Seed database');
    expect(menuPath('apply')).toBe('Review & apply changes → Apply changes');
    expect(menuPath('unlock')).toBe('Repair stack → Unlock stack');
    expect(menuPath('fetch-admin-key')).toBe('Repair stack → Fetch admin application key');
    expect(menuPath('geoip-refresh')).toBe('pnpm infra geoip-refresh');
  });
});

describe('one name per action', () => {
  it('keeps retired labels out of the source and the docs', () => {
    const self = path.relative(repoRoot, import.meta.filename);
    const hits = [...DOCS, ...infraSources().filter((file) => file !== self)].flatMap((file) => {
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
      // `pnpm infra` → **Row** (→ **Action**), and the command form `pnpm infra <action>`.
      for (const match of text.matchAll(/`pnpm infra` → \*\*([^*]+)\*\*(?: → \*\*([^*]+)\*\*)?/g)) {
        for (const name of [match[1], match[2]]) if (name && !known.has(name)) unknown.push(`${file}: ${name}`);
      }
      for (const match of text.matchAll(/pnpm infra ([a-z][a-z-]*)/g)) {
        const word = match[1] ?? '';
        if (word !== 'help' && !isOperatorActionId(word)) unknown.push(`${file}: pnpm infra ${word}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});
