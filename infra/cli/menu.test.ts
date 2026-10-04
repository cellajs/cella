import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { actionChoices, BACK, categoryChoices, dbAccessRow, disabledReason, formatStackLine, type MenuState, QUIT } from './menu';

const bootstrapped: MenuState = { stackState: 'bootstrapped', environment: 'staging', encrypted: true, hasAdminKey: true, dbExposed: false };

/** Row names without colour, so an assertion reads the same in a terminal and in CI. */
const names = (choices: Array<{ name: string }>) => choices.map((choice) => stripVTControlCharacters(choice.name));

describe('categoryChoices', () => {
  it('offers status, the three submenus and a way out', () => {
    expect(categoryChoices().map((choice) => choice.value)).toEqual(['status', 'database', 'keys', 'stack', QUIT]);
  });
});

describe('actionChoices', () => {
  it('lists every action of a submenu and ends with Back', () => {
    expect(names(actionChoices('database', bootstrapped))).toEqual(['Reset database', 'Seed database', 'Open public DB access', '← Back']);
    expect(names(actionChoices('keys', bootstrapped))).toEqual([
      'Rotate keys',
      'Rotate passphrase',
      'Manage runtime secrets',
      'Fetch admin application key',
      'Store passphrase in keychain',
      '← Back',
    ]);
    expect(names(actionChoices('stack', bootstrapped))).toEqual([
      'Apply infra change',
      'Preview',
      'Resume',
      'Unlock',
      'Refresh GeoIP data',
      'Tear down stack',
      '← Back',
    ]);
    expect(actionChoices('stack', bootstrapped).at(-1)?.value).toBe(BACK);
  });

  it('disables nothing on a bootstrapped staging stack with the admin key', () => {
    for (const category of ['database', 'keys', 'stack'] as const) {
      expect(actionChoices(category, bootstrapped).filter((choice) => choice.disabled)).toEqual([]);
    }
  });

  it('keeps a row that cannot run in the list, with the reason', () => {
    const partial: MenuState = { ...bootstrapped, stackState: 'partial', encrypted: false, hasAdminKey: false };
    const disabled = (category: 'database' | 'keys' | 'stack') =>
      Object.fromEntries(
        actionChoices(category, partial)
          .filter((choice) => choice.disabled)
          .map((choice) => [choice.value, choice.disabled]),
      );
    expect(names(actionChoices('stack', partial))).toHaveLength(7);
    expect(disabled('stack')).toEqual({
      apply: '(needs a bootstrapped stack: run "Resume" first)',
      preview: '(needs a bootstrapped stack: run "Resume" first)',
      'geoip-refresh': '(needs the admin key: run "Fetch admin application key")',
    });
    expect(disabled('keys')).toEqual({ 'rotate-passphrase': '(the stack has no encrypted state yet)' });
    expect(Object.keys(disabled('database'))).toEqual(['reset-database', 'seed-db', 'expose-db']);
  });

  it('fits every disabled row on one 80-column line', () => {
    const worst: MenuState = { stackState: 'partial', environment: 'production', encrypted: false, hasAdminKey: false, dbExposed: true };
    for (const category of ['database', 'keys', 'stack'] as const) {
      for (const choice of actionChoices(category, worst).filter((entry) => entry.disabled)) {
        // The prompt renders a disabled row as "- <name> <reason>".
        expect(`- ${stripVTControlCharacters(choice.name)} ${choice.disabled}`.length).toBeLessThanOrEqual(80);
      }
    }
  });

  it('says which key every action runs with', () => {
    for (const category of ['database', 'keys', 'stack'] as const) {
      for (const choice of actionChoices(category, bootstrapped).filter((entry) => entry.value !== BACK)) {
        expect(choice.description).toMatch(/(Needs your Owner API key|Uses the admin application key|Works without a Scaleway key)\.$/);
      }
    }
  });
});

describe('disabledReason', () => {
  it('refuses seed data on production and allows a reset there', () => {
    const production: MenuState = { ...bootstrapped, environment: 'production' };
    expect(disabledReason('seed-db', production)).toBe('seed data never goes to production');
    expect(disabledReason('reset-database', production)).toBeUndefined();
  });

  it('leaves the actions that repair a stack available on a partial one', () => {
    const partial: MenuState = { ...bootstrapped, stackState: 'partial' };
    for (const id of ['resume', 'rotate', 'unlock', 'teardown', 'fetch-admin-key', 'secrets'] as const) {
      expect(disabledReason(id, partial)).toBeUndefined();
    }
  });
});

describe('dbAccessRow', () => {
  it('opens while nothing is exposed', () => {
    expect(dbAccessRow(bootstrapped)).toMatchObject({ value: 'expose-db', name: 'Open public DB access' });
  });

  it('closes while the exposure config says open', () => {
    const row = dbAccessRow({ ...bootstrapped, dbExposed: true });
    expect(row.value).toBe('unexpose-db');
    expect(stripVTControlCharacters(row.name)).toBe('Close public DB access (OPEN)');
  });

  it('closes a live endpoint that no exposure config accounts for, and names it', () => {
    const row = dbAccessRow({ ...bootstrapped, liveEndpoints: ['51.15.0.1:5432'] });
    expect(row.value).toBe('unexpose-db');
    expect(stripVTControlCharacters(row.name)).toBe('Close public DB access (OPEN with exposure off)');
    expect(row.description).toContain('51.15.0.1:5432');
  });

  it('follows the exposure config when the live read gave no answer', () => {
    expect(dbAccessRow({ ...bootstrapped, liveEndpoints: undefined }).value).toBe('expose-db');
    expect(dbAccessRow({ ...bootstrapped, liveEndpoints: [] }).value).toBe('expose-db');
  });
});

describe('formatStackLine', () => {
  it('names the app, the mode, the state and the stack file', () => {
    const line = stripVTControlCharacters(formatStackLine({ slug: 'acme', environment: 'production', state: 'bootstrapped' }));
    expect(line).toBe('acme · production · bootstrapped (Pulumi.production.yaml)');
  });

  it('names no stack file on a fresh install', () => {
    expect(stripVTControlCharacters(formatStackLine({ slug: 'acme', environment: 'staging', state: 'fresh' }))).toBe('acme · staging · fresh');
  });
});
