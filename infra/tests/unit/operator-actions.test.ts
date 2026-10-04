import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { actionDescription, actionLabel, CATEGORY_LABELS, menuPath, OPERATOR_ACTIONS, type OperatorActionId } from '../../lib/operator-actions';

const infraRoot = path.resolve(import.meta.dirname, '../..');
const repoRoot = path.resolve(infraRoot, '..');

const ids = Object.keys(OPERATOR_ACTIONS) as OperatorActionId[];
const labels = ids.map(actionLabel);

/** Names an action carried before it had one name. None may come back in a message, a comment or the docs. */
const RETIRED_LABELS = ['Open temporary public DB access', 'Expose database publicly', 'Stop public DB exposure', 'Public DB access: OPEN'];

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

  it('builds the menu path from the submenu and the label', () => {
    expect(menuPath('status')).toBe('Show status');
    expect(menuPath('unlock')).toBe('Stack setup → Unlock');
    expect(menuPath('fetch-admin-key')).toBe('Manage keys & secrets → Fetch admin application key');
    expect(menuPath('unexpose-db')).toBe('Manage database → Close public DB access');
  });

  it('ends every description with the key the action runs with', () => {
    expect(actionDescription('apply')).toMatch(/Needs your Owner API key\.$/);
    expect(actionDescription('preview')).toMatch(/Uses the admin application key\.$/);
    expect(actionDescription('status')).toMatch(/Works without a Scaleway key\.$/);
    expect(actionDescription('unexpose-db', 'Delete the stray endpoint.')).toBe('Delete the stray endpoint. Needs your Owner API key.');
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

  it('points the docs at menu rows that exist', () => {
    const known = new Set<string>([...labels, ...Object.values(CATEGORY_LABELS)]);
    const unknown: string[] = [];
    for (const file of DOCS) {
      const text = readFileSync(path.join(repoRoot, file), 'utf8');
      // `pnpm infra` → **Label**, and the shell-comment form `pnpm infra   # → Submenu → "Label"`.
      const bold = [...text.matchAll(/`pnpm infra` → \*\*([^*]+)\*\*/g)].map((match) => match[1] ?? '');
      const comment = [...text.matchAll(/pnpm infra\s+# → (.+)$/gm)].flatMap((match) =>
        (match[1] ?? '').split(' → ').map((part) => part.replace(/"/g, '')),
      );
      for (const name of [...bold, ...comment]) if (!known.has(name)) unknown.push(`${file}: ${name}`);
    }
    expect(unknown).toEqual([]);
  });
});
