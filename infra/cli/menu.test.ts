import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  BACK,
  disabledReason,
  formatAccessLines,
  formatOperatorLine,
  formatStackLine,
  type MenuItem,
  type MenuState,
  mainMenuItems,
  pickItems,
  QUIT,
  rowDisabledReason,
  visibleRows,
} from './menu';

const bootstrapped: MenuState = { stackState: 'bootstrapped', environment: 'staging', encrypted: true, dbExposed: false };
const partial: MenuState = { ...bootstrapped, stackState: 'partial', encrypted: false };

const plain = (text: string) => stripVTControlCharacters(text);

/** The menu as an operator reads it: one line per item, group headings flush left, disabled entries as the prompt renders them. */
function render(items: Array<MenuItem<string>>): string[] {
  return items.map((item) => {
    if ('group' in item) return item.group;
    return item.disabled ? `- ${plain(item.name)} ${item.disabled}` : `  ${plain(item.name)}`;
  });
}

describe('mainMenuItems', () => {
  it('lists ten rows under five groups on a healthy stack, then Quit', () => {
    expect(render(mainMenuItems(bootstrapped))).toEqual([
      'Observe',
      '  Show status              read-only',
      '  Show runs                read-only',
      '  Review & apply changes   operator key',
      'Change',
      '  Rotate keys & secrets ›  keys, secrets, passphrase, operator key',
      '  Manage runtime secrets   operator key',
      '  Update identities        Owner key',
      'Database',
      '  Open public DB access ›  operator key · temporary, locked to your IP',
      '  Reset database           operator key · DESTRUCTIVE',
      'Recover',
      '  Repair stack ›           stack lock, setup',
      'Rare',
      '  Tear down stack          Owner key · DESTRUCTIVE',
      '',
      '  Quit',
    ]);
  });

  it('keeps every row on a partial stack and says why a row cannot run', () => {
    expect(render(mainMenuItems(partial))).toEqual([
      'Observe',
      '  Show status              read-only',
      '  Show runs                read-only',
      '- Review & apply changes (needs a bootstrapped stack: run "Resume setup")',
      'Change',
      '  Rotate keys & secrets ›  keys, secrets, passphrase, operator key',
      '  Manage runtime secrets   operator key',
      '  Update identities        Owner key',
      'Database',
      '- Open public DB access › (needs a bootstrapped stack: run "Resume setup")',
      '- Reset database (needs a bootstrapped stack: run "Resume setup")',
      'Recover',
      '  Repair stack ›           stack lock, setup',
      'Rare',
      '  Tear down stack          Owner key · DESTRUCTIVE',
      '',
      '  Quit',
    ]);
  });

  it('shows the close row while the exposure config says open', () => {
    const lines = render(mainMenuItems({ ...bootstrapped, dbExposed: true }));
    expect(lines).toContain('  Close public DB access (OPEN)  operator key');
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
    expect(render(pickItems('rotate', bootstrapped))).toEqual([
      '  Rotate keys          Owner key',
      '  Rotate secrets       operator key',
      '  Rotate passphrase    operator key',
      '  Set up operator key  Owner key',
      '  ← Back',
    ]);
    expect(render(pickItems('repair', bootstrapped))).toEqual(['  Unlock stack  operator key', '  Resume setup  operator key', '  ← Back']);
    expect(pickItems('repair', bootstrapped).at(-1)?.value).toBe(BACK);
  });

  it('disables seeding on production and leaves the plain open available', () => {
    expect(render(pickItems('db-open', { ...bootstrapped, environment: 'production' }))).toEqual([
      '  Open public DB access  operator key',
      '- Seed database (seed data never goes to production)',
      '  ← Back',
    ]);
  });

  it('disables the passphrase rotation on a stack without encrypted state', () => {
    expect(render(pickItems('rotate', partial))).toEqual([
      '  Rotate keys          Owner key',
      '  Rotate secrets       operator key',
      '- Rotate passphrase (the stack has no encrypted state yet)',
      '  Set up operator key  Owner key',
      '  ← Back',
    ]);
  });

  it('ends every description with the key the action runs with', () => {
    for (const id of ['rotate', 'db-open', 'repair'] as const) {
      for (const choice of pickItems(id, bootstrapped).filter((entry) => entry.value !== BACK)) {
        expect(choice.description).toMatch(
          /(Needs your operator key|Needs your Owner API key|Reads with the observer key|Works without a Scaleway key)\.$/,
        );
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
    for (const id of ['resume', 'rotate-keys', 'unlock', 'teardown', 'secrets', 'status'] as const) {
      expect(disabledReason(id, partial)).toBeUndefined();
    }
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

describe('formatOperatorLine', () => {
  const line = (operator: Parameters<typeof formatOperatorLine>[0]) => plain(formatOperatorLine(operator));
  const present = (cidrs: string[], open = false) => ({ state: 'present' as const, cidrs, open });

  it('points a stack without an operator application at the action that sets one up', () => {
    expect(line({ lock: { state: 'absent', cidrs: [], open: false }, verdict: 'unknown' })).toBe(
      '○ Operator key: none yet, so privileged actions ask for your Owner API key (pnpm infra operator-key sets one up)',
    );
  });

  it('says the key works from this machine when its address is on the list', () => {
    expect(line({ lock: present(['203.0.113.7/32']), verdict: 'inside', address: '203.0.113.7' })).toBe(
      '● Operator key: works from this address (203.0.113.7/32)',
    );
  });

  it('must not leave a refusal looking like an empty stack: an address off the list is named before any action', () => {
    expect(line({ lock: present(['203.0.113.7/32']), verdict: 'outside', address: '198.51.100.9' })).toBe(
      '● Operator key: works from 203.0.113.7/32 only; this machine is 198.51.100.9',
    );
  });

  it('must not call an open policy locked: a rule without its condition is reported as working from every address', () => {
    expect(line({ lock: present([], true), verdict: 'unknown' })).toBe(
      '● Operator key: works from every address: a rule of its policy has no address condition',
    );
  });

  it('names the list alone when this machine has no detectable address', () => {
    expect(line({ lock: present(['203.0.113.7/32']), verdict: 'unknown' })).toBe('○ Operator key: works from 203.0.113.7/32');
  });
});

describe('formatAccessLines', () => {
  const lines = (facts: Parameters<typeof formatAccessLines>[0]) => formatAccessLines(facts).map(plain);

  it('says the operator key is asked for when nothing is known about it', () => {
    expect(lines({ stackState: 'partial', dbExposed: false })).toEqual(['○ Operator key: asked when an action needs it']);
    expect(
      lines({ operator: { lock: { state: 'unknown', cidrs: [], open: false }, verdict: 'unknown' }, stackState: 'partial', dbExposed: false }),
    ).toEqual(['○ Operator key: asked when an action needs it']);
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
