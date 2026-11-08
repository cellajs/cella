import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  BACK,
  disabledReason,
  formatStackLine,
  type MenuItem,
  type MenuState,
  mainMenuItems,
  menuHotkeys,
  pickItems,
  QUIT,
  rowDisabledReason,
  UP_NEXT,
  visibleRows,
} from './menu';

const bootstrapped: MenuState = { stackState: 'bootstrapped', environment: 'staging', dbExposed: false };
const partial: MenuState = { ...bootstrapped, stackState: 'partial' };

const plain = (text: string) => stripVTControlCharacters(text);

/** The menu as an operator reads it: one line per item, group headings flush left, disabled entries as the prompt renders them. */
function render(items: Array<MenuItem<string>>): string[] {
  return items.map((item) => {
    if ('group' in item) return item.group;
    return item.disabled ? `- ${plain(item.name)} ${item.disabled}` : `  ${plain(item.name)}`;
  });
}

describe('mainMenuItems', () => {
  it('lists twelve rows by task under five groups on a healthy stack, each with its letter, then Quit', () => {
    expect(render(mainMenuItems(bootstrapped))).toEqual([
      'Deploys',
      '  d  Deploy now',
      '  r  Releases & roll back',
      '  l  Deploy logs',
      '  s  Full status',
      'Configure',
      '  e  Env vars & secrets',
      '  a  Infrastructure changes ›',
      '  i  Update identities',
      'Database',
      '  p  Open DB access ›',
      '  x  Reset database  destructive',
      'Account',
      '  k  Keys & operators ›',
      'More',
      '  u  Repair ›',
      '  t  Tear down  destructive',
      '',
      '  q  Quit',
    ]);
  });

  it('leads with the recommended step when the home screen has one', () => {
    const items = mainMenuItems({ ...bootstrapped, upNext: { action: 'start-deploy', description: 'Deploy 0.35.0 again' } });
    expect(render(items).slice(0, 3)).toEqual(['', '  ▶  Up next: Deploy 0.35.0 again', 'Deploys']);
    expect(items[1]).toMatchObject({ value: UP_NEXT });
  });

  it('keeps every row on a stack whose setup is unfinished and says why a row cannot run', () => {
    expect(render(mainMenuItems(partial))).toEqual([
      'Deploys',
      '- Deploy now (needs a set-up environment: run "Resume setup")',
      '- Releases & roll back (needs a set-up environment: run "Resume setup")',
      '  l  Deploy logs',
      '  s  Full status',
      'Configure',
      '  e  Env vars & secrets',
      '- Infrastructure changes › (needs a set-up environment: run "Resume setup")',
      '  i  Update identities',
      'Database',
      '- Open DB access › (needs a set-up environment: run "Resume setup")',
      '- Reset database (needs a set-up environment: run "Resume setup")',
      'Account',
      '  k  Keys & operators ›',
      'More',
      '  u  Repair ›',
      '  t  Tear down  destructive',
      '',
      '  q  Quit',
    ]);
  });

  it('shows the close row while the exposure config says open', () => {
    const lines = render(mainMenuItems({ ...bootstrapped, dbExposed: true }));
    expect(lines).toContain('  p  Close DB access (OPEN)');
    expect(lines.some((line) => line.includes('Open DB access'))).toBe(false);
  });

  it('shows the close row for a live endpoint no exposure config accounts for, and names it', () => {
    const items = mainMenuItems({ ...bootstrapped, liveEndpoints: ['51.15.0.1:5432'] });
    const row = items.find((item) => 'value' in item && item.value === 'db-close');
    expect(row && 'name' in row ? plain(row.name) : '').toContain('Close DB access (OPEN)');
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

describe('menuHotkeys', () => {
  it('gives every listed row its own letter, the two DB access rows sharing theirs', () => {
    const open = menuHotkeys(bootstrapped);
    expect(Object.keys(open)).toHaveLength(visibleRows(bootstrapped).length);
    expect(open.p).toBe('db-open');
    expect(menuHotkeys({ ...bootstrapped, dbExposed: true }).p).toBe('db-close');
    expect(open.q).toBeUndefined();
  });
});

describe('pickItems', () => {
  it('offers the actions of a row with the key each runs with, then Back', () => {
    expect(render(pickItems('keys', bootstrapped))).toEqual([
      '  Rotate keys              Owner key',
      '  Rotate secrets           operator key',
      '  Set up operators         Owner key',
      '  Set repository read key  operator key',
      '  ← Back',
    ]);
    expect(render(pickItems('repair', bootstrapped))).toEqual([
      '  Unlock             operator key',
      '  Resume setup       operator key',
      '  Remove from state  operator key',
      '  ← Back',
    ]);
    expect(pickItems('repair', bootstrapped).at(-1)?.value).toBe(BACK);
  });

  it('disables seeding on production and leaves the plain open available', () => {
    expect(render(pickItems('db-open', { ...bootstrapped, environment: 'production' }))).toEqual([
      '  Open DB access  operator key',
      '- Seed database (seed data never goes to production)',
      '  ← Back',
    ]);
  });

  it('ends every description with the key the action runs with', () => {
    for (const id of ['keys', 'db-open', 'repair', 'changes'] as const) {
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

  it('leaves the actions that repair a stack available on an unfinished one', () => {
    for (const id of ['resume', 'rotate-keys', 'unlock', 'teardown', 'secrets', 'status'] as const) {
      expect(disabledReason(id, partial)).toBeUndefined();
    }
  });
});

describe('rowDisabledReason', () => {
  it('disables a row only when every action behind it is blocked', () => {
    expect(rowDisabledReason('changes', partial)).toBe('needs a set-up environment: run "Resume setup"');
    expect(rowDisabledReason('keys', partial)).toBeUndefined();
    expect(rowDisabledReason('db-open', { ...bootstrapped, environment: 'production' })).toBeUndefined();
    expect(rowDisabledReason('repair', partial)).toBeUndefined();
  });
});

describe('formatStackLine', () => {
  it('names the app and the mode, and says when the setup is unfinished', () => {
    expect(plain(formatStackLine({ slug: 'acme', environment: 'production', state: 'bootstrapped' }))).toBe('⧈ acme · production');
    expect(plain(formatStackLine({ slug: 'acme', environment: 'staging', state: 'partial' }))).toBe('⧈ acme · staging · setup not finished');
  });

  it('says new on a fresh install', () => {
    expect(plain(formatStackLine({ slug: 'acme', environment: 'staging', state: 'fresh' }))).toBe('⧈ acme · staging · new');
  });
});
