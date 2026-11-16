import { stripVTControlCharacters } from 'node:util';
import { Separator } from '@inquirer/prompts';
import { describe, expect, it } from 'vitest';
import { BACK, disabledReason, type MenuItem, type MenuState, mainMenuItems, pickItems, QUIT, rowDisabledReason, UP_NEXT, visibleRows } from './menu';

const bootstrapped: MenuState = { stackState: 'bootstrapped', environment: 'staging', dbExposed: false };
const partial: MenuState = { ...bootstrapped, stackState: 'partial' };

const plain = (text: string) => stripVTControlCharacters(text);

/** The menu as an operator reads it: one line per item, group headings flush left, disabled entries as the prompt renders them. */
function render(items: Array<MenuItem<string>>): string[] {
  return items.map((item) => {
    if (item instanceof Separator) return ` ${plain(item.separator)}`;
    if ('group' in item) return item.group;
    return item.disabled ? `- ${plain(item.name)} ${item.disabled}` : `  ${plain(item.name)}`;
  });
}

describe('mainMenuItems', () => {
  it('lists the daily rows on a healthy stack with their descriptions in one column, then More and Quit', () => {
    expect(render(mainMenuItems(bootstrapped))).toEqual([
      '  Full status             every check and finding, and what fixes it',
      '  Review & apply changes  what differs from what runs, applied on your yes',
      '  Env vars & secrets      the values the services read at boot',
      '  Releases & roll back    the last releases; deploy an earlier one again',
      '  Deploy logs             the last deploys and how each ended',
      '  Open DB access          a public endpoint to your IP, until you close it',
      '  More ›                  deploy now, keys, repairs, the database, teardown',
      ` ${'─'.repeat(40)}`,
      '  Quit',
    ]);
  });

  it('leads with the recommended step when the home screen has one', () => {
    const items = mainMenuItems({ ...bootstrapped, upNext: { action: 'deploy', description: 'Deploy 0.35.0 again' } });
    expect(render(items).slice(0, 2)).toEqual(['  ▶  Deploy 0.35.0 again', '']);
    expect(items[0]).toMatchObject({ value: UP_NEXT });
  });

  it('keeps every row on a stack whose setup is unfinished and says why a row cannot run', () => {
    expect(render(mainMenuItems(partial)).filter((line) => line.startsWith('-'))).toEqual([
      '- Review & apply changes (needs a set-up environment: run "Resume setup")',
      '- Releases & roll back (needs a set-up environment: run "Resume setup")',
      '- Open DB access (needs a set-up environment: run "Resume setup")',
    ]);
  });

  it('shows the close row while the exposure config says open', () => {
    const lines = render(mainMenuItems({ ...bootstrapped, dbExposed: true }));
    expect(lines.some((line) => line.startsWith('  Close DB access (OPEN)  '))).toBe(true);
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

  it('fits every row on one 80-column line and every description on one 96-column line that names no key, in every state', () => {
    const states: MenuState[] = [
      bootstrapped,
      partial,
      { ...bootstrapped, environment: 'production', dbExposed: true },
      { ...bootstrapped, liveEndpoints: ['51.15.0.1:5432'] },
      { ...partial, environment: 'production', dbExposed: true },
    ];
    for (const state of states) {
      const menus = [mainMenuItems(state), ...visibleRows(state).map((id) => pickItems(id, state))];
      for (const items of menus) {
        for (const line of render(items)) expect(line.length).toBeLessThanOrEqual(80);
        for (const item of items) {
          const description = 'description' in item ? (item.description ?? '') : '';
          expect(description.length).toBeLessThanOrEqual(96);
          expect(description).not.toMatch(/destructive|observer key|operator key|owner key/i);
        }
      }
    }
  });

  it('ends with the way out', () => {
    expect(mainMenuItems(bootstrapped).at(-1)).toMatchObject({ value: QUIT });
  });
});

describe('pickItems', () => {
  it('lists the rare actions under headings with the key each runs with, then Back', () => {
    expect(render(pickItems('more', { ...bootstrapped, environment: 'production' }))).toEqual([
      '',
      'Deploys & changes',
      '  Deploy now               operator key',
      '  Preview changes          operator key',
      '',
      'Keys & access',
      '  Rotate keys              Owner key',
      '  Rotate secrets           operator key',
      '  Set up operators         Owner key',
      '  Update identities        Owner key',
      '  Set repository read key  operator key',
      '',
      'Repair',
      '  Unlock                   operator key',
      '  Resume setup             operator key',
      '  Remove from state        operator key',
      '',
      'Database',
      '- Seed database (seed data never goes to production)',
      '  Reset database           operator key',
      '',
      'Environment',
      '  Import a .env file       operator key',
      '  Tear down                Owner key',
      ` ${'─'.repeat(40)}`,
      '  ← Back',
    ]);
    expect(pickItems('more', bootstrapped).at(-1)).toMatchObject({ value: BACK });
  });
});

describe('disabledReason', () => {
  it('refuses seed data on production and allows a reset there', () => {
    const production: MenuState = { ...bootstrapped, environment: 'production' };
    expect(disabledReason('db-seed', production)).toBe('seed data never goes to production');
    expect(disabledReason('db-reset', production)).toBeUndefined();
  });

  it('leaves the actions that repair a stack available on an unfinished one', () => {
    for (const id of ['resume', 'rotate-keys', 'unlock', 'teardown', 'env', 'status'] as const) {
      expect(disabledReason(id, partial)).toBeUndefined();
    }
  });
});

describe('rowDisabledReason', () => {
  it('disables a row only when every action behind it is blocked', () => {
    expect(rowDisabledReason('apply', partial)).toBe('needs a set-up environment: run "Resume setup"');
    expect(rowDisabledReason('more', partial)).toBeUndefined();
  });
});
