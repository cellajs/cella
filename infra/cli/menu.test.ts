import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  BACK,
  disabledReason,
  formatAccessLines,
  formatStackLine,
  type MenuItem,
  type MenuState,
  mainMenuItems,
  pickItems,
  QUIT,
  rowDisabledReason,
  visibleRows,
} from './menu';

const bootstrapped: MenuState = { stackState: 'bootstrapped', environment: 'staging', encrypted: true, hasAdminKey: true, dbExposed: false };
const partial: MenuState = { ...bootstrapped, stackState: 'partial', encrypted: false, hasAdminKey: false };

const plain = (text: string) => stripVTControlCharacters(text);

/** The menu as an operator reads it: one line per item, group headings flush left, disabled entries as the prompt renders them. */
function render(items: Array<MenuItem<string>>): string[] {
  return items.map((item) => {
    if ('group' in item) return item.group;
    return item.disabled ? `- ${plain(item.name)} ${item.disabled}` : `  ${plain(item.name)}`;
  });
}

describe('mainMenuItems', () => {
  it('lists eight rows under five groups on a healthy stack, then Quit', () => {
    expect(render(mainMenuItems(bootstrapped))).toEqual([
      'Observe',
      '  Show status               read-only',
      '  Review & apply changes ›  admin key to review · Owner key to apply',
      'Change',
      '  Rotate keys & secrets ›   CI deploy key, admin key, passphrase',
      '  Manage runtime secrets    Owner key',
      'Database',
      '  Open public DB access ›   Owner key · temporary, locked to your IP',
      '  Reset database            Owner key · DESTRUCTIVE',
      'Recover',
      '  Repair stack ›            stack lock, setup, admin key',
      'Rare',
      '  Tear down stack           Owner key · DESTRUCTIVE',
      '',
      '  Quit',
    ]);
  });

  it('keeps every row on a partial stack and says why a row cannot run', () => {
    expect(render(mainMenuItems(partial))).toEqual([
      'Observe',
      '  Show status               read-only',
      '- Review & apply changes › (needs a bootstrapped stack: run "Resume setup")',
      'Change',
      '  Rotate keys & secrets ›   CI deploy key, admin key, passphrase',
      '  Manage runtime secrets    Owner key',
      'Database',
      '- Open public DB access › (needs a bootstrapped stack: run "Resume setup")',
      '- Reset database (needs a bootstrapped stack: run "Resume setup")',
      'Recover',
      '  Repair stack ›            stack lock, setup, admin key',
      'Rare',
      '  Tear down stack           Owner key · DESTRUCTIVE',
      '',
      '  Quit',
    ]);
  });

  it('shows the close row while the exposure config says open', () => {
    const lines = render(mainMenuItems({ ...bootstrapped, dbExposed: true }));
    expect(lines).toContain('  Close public DB access (OPEN)  Owner key');
    expect(lines.some((line) => line.includes('Open public DB access'))).toBe(false);
  });

  it('shows the close row for a live endpoint no exposure config accounts for, and names it', () => {
    const items = mainMenuItems({ ...bootstrapped, liveEndpoints: ['51.15.0.1:5432'] });
    const row = items.find((item) => 'value' in item && item.value === 'db-close');
    expect(row && 'name' in row ? plain(row.name) : '').toContain('Close public DB access (OPEN)');
    expect(row && 'description' in row ? row.description : '').toContain('51.15.0.1:5432');
  });

  it('follows the exposure config when the instance was not read or has no endpoint', () => {
    expect(visibleRows({ ...bootstrapped, liveEndpoints: undefined })).toContain('db-open');
    expect(visibleRows({ ...bootstrapped, liveEndpoints: [] })).toContain('db-open');
    expect(visibleRows({ ...bootstrapped, liveEndpoints: [] })).not.toContain('db-close');
  });

  it('fits every row on one 80-column line in every state', () => {
    const states: MenuState[] = [
      bootstrapped,
      partial,
      { ...bootstrapped, environment: 'production', dbExposed: true },
      { ...bootstrapped, liveEndpoints: ['51.15.0.1:5432'] },
      { ...partial, environment: 'production', dbExposed: true },
    ];
    for (const state of states) {
      for (const line of render(mainMenuItems(state))) expect(line.length).toBeLessThanOrEqual(80);
      for (const id of visibleRows(state)) for (const line of render(pickItems(id, state))) expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it('ends with the way out', () => {
    expect(mainMenuItems(bootstrapped).at(-1)).toMatchObject({ value: QUIT });
  });
});

describe('pickItems', () => {
  it('offers the actions of a row with the key each runs with, then Back', () => {
    expect(render(pickItems('changes', bootstrapped))).toEqual(['  Preview changes  admin key', '  Apply changes    Owner key', '  ← Back']);
    expect(render(pickItems('rotate', bootstrapped))).toEqual(['  Rotate keys        Owner key', '  Rotate passphrase  admin key', '  ← Back']);
    expect(render(pickItems('repair', bootstrapped))).toEqual([
      '  Unlock stack                 admin key',
      '  Resume setup                 Owner key',
      '  Fetch admin application key  Owner key',
      '  ← Back',
    ]);
    expect(pickItems('repair', bootstrapped).at(-1)?.value).toBe(BACK);
  });

  it('disables seeding on production and leaves the plain open available', () => {
    expect(render(pickItems('db-open', { ...bootstrapped, environment: 'production' }))).toEqual([
      '  Open public DB access  Owner key',
      '- Seed database (seed data never goes to production)',
      '  ← Back',
    ]);
  });

  it('disables the passphrase rotation on a stack without encrypted state', () => {
    expect(render(pickItems('rotate', partial))).toEqual([
      '  Rotate keys        Owner key',
      '- Rotate passphrase (the stack has no encrypted state yet)',
      '  ← Back',
    ]);
  });

  it('ends every description with the key the action runs with', () => {
    for (const id of ['changes', 'rotate', 'db-open', 'repair'] as const) {
      for (const choice of pickItems(id, bootstrapped).filter((entry) => entry.value !== BACK)) {
        expect(choice.description).toMatch(/(Needs your Owner API key|Uses the admin application key|Works without a Scaleway key)\.$/);
      }
    }
  });
});

describe('disabledReason', () => {
  it('refuses seed data on production and allows a reset there', () => {
    const production: MenuState = { ...bootstrapped, environment: 'production' };
    expect(disabledReason('db-seed', production)).toBe('seed data never goes to production');
    expect(disabledReason('db-reset', production)).toBeUndefined();
  });

  it('leaves the actions that repair a stack available on a partial one', () => {
    for (const id of ['resume', 'rotate-keys', 'unlock', 'teardown', 'fetch-admin-key', 'secrets', 'status'] as const) {
      expect(disabledReason(id, partial)).toBeUndefined();
    }
  });

  it('asks for the admin key before a GeoIP refresh', () => {
    expect(disabledReason('geoip-refresh', { ...bootstrapped, hasAdminKey: false })).toBe('needs the admin key: run "Fetch admin application key"');
    expect(disabledReason('geoip-refresh', bootstrapped)).toBeUndefined();
  });
});

describe('rowDisabledReason', () => {
  it('disables a row only when every action behind it is blocked', () => {
    expect(rowDisabledReason('changes', partial)).toBe('needs a bootstrapped stack: run "Resume setup"');
    expect(rowDisabledReason('rotate', partial)).toBeUndefined();
    expect(rowDisabledReason('db-open', { ...bootstrapped, environment: 'production' })).toBeUndefined();
    expect(rowDisabledReason('repair', partial)).toBeUndefined();
  });
});

describe('formatStackLine', () => {
  it('names the app, the mode, the state and the stack file', () => {
    expect(plain(formatStackLine({ slug: 'acme', environment: 'production', state: 'bootstrapped' }))).toBe(
      'acme · production · bootstrapped (Pulumi.production.yaml)',
    );
  });

  it('names no stack file on a fresh install', () => {
    expect(plain(formatStackLine({ slug: 'acme', environment: 'staging', state: 'fresh' }))).toBe('acme · staging · fresh');
  });
});

describe('formatAccessLines', () => {
  const lines = (facts: Parameters<typeof formatAccessLines>[0]) => formatAccessLines(facts).map(plain);

  it('says where the Owner API key comes from', () => {
    expect(lines({ ownerKeySource: 'SCW_OWNER_*', stackState: 'partial', dbExposed: false })).toEqual([
      '● Owner API key: SCW_OWNER_* in infra/.env.<mode>',
    ]);
    expect(lines({ stackState: 'partial', dbExposed: false })).toEqual(['○ Owner API key: asked when an action needs it']);
  });

  it('reports a private database only when the instance was read', () => {
    expect(lines({ stackState: 'bootstrapped', dbExposed: false, liveEndpoints: [] })[1]).toBe('● DB access: private');
    expect(lines({ stackState: 'bootstrapped', dbExposed: false })).toHaveLength(1);
  });

  it('reports an open endpoint and the action that closes it', () => {
    expect(lines({ stackState: 'bootstrapped', dbExposed: true, liveEndpoints: ['51.15.0.1:5432'] })[1]).toBe(
      '● DB access: OPEN at 51.15.0.1:5432; close it with "Close public DB access"',
    );
    expect(lines({ stackState: 'bootstrapped', dbExposed: false, liveEndpoints: ['51.15.0.1:5432'] })[1]).toContain('although exposure is off');
  });

  it('falls back to the exposure config when the instance was not read', () => {
    expect(lines({ stackState: 'bootstrapped', dbExposed: true })[1]).toBe('● DB access: exposure is configured (the instance was not read)');
  });
});
