import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { RuntimeSecretDefinition } from '../lib/runtime-secrets';
import { formatSecretsTable, planEnvImport, secretsTable } from './manage-runtime-secrets';

const definition = (overrides: Partial<RuntimeSecretDefinition>): RuntimeSecretDefinition => ({
  id: 'x',
  secretName: 'x',
  description: '',
  envVar: 'X',
  required: false,
  valueSource: 'operator',
  generation: 'manual',
  services: ['backend'],
  ...overrides,
});

describe('secretsTable', () => {
  it.each([
    { state: 'missing · required', mark: '✖', secret: { required: true }, container: undefined },
    { state: 'empty · optional', mark: '○', secret: {}, container: { version_count: 0 } },
    { state: 'set Nov 8', mark: '●', secret: {}, container: { version_count: 2, setAt: '2026-11-08T12:00:00Z' } },
    { state: 'made by infra', mark: '◇', secret: { valueSource: 'engine', generation: 'random', rotatable: true }, container: undefined },
    { state: 'made by infra · kept', mark: '◇', secret: { valueSource: 'engine', generation: 'random' }, container: undefined },
  ] as const)('reads $state', ({ state, mark, secret, container }) => {
    const rows = secretsTable([definition(secret)], new Map(container ? [['x', container]] : []));

    expect(rows.map((row) => row.state)).toEqual([state]);
    expect(stripVTControlCharacters(formatSecretsTable(rows)[1] ?? '')).toMatch(new RegExp(`^${mark} X +backend +${state}$`));
  });

  it('puts required values without a version first, then set ones, then optional ones, then the ones infra makes, in registry order', () => {
    const rows = secretsTable(
      [
        definition({ envVar: 'ENGINE', secretName: 'engine', valueSource: 'engine' }),
        definition({ envVar: 'SET', secretName: 'set' }),
        definition({ envVar: 'OPTIONAL', secretName: 'optional' }),
        definition({ envVar: 'REQUIRED_A', secretName: 'required-a', required: true }),
        definition({ envVar: 'REQUIRED_B', secretName: 'required-b', required: true }),
      ],
      new Map([['set', { version_count: 1 }]]),
    );

    expect(rows.map((row) => row.envVar)).toEqual(['REQUIRED_A', 'REQUIRED_B', 'SET', 'OPTIONAL', 'ENGINE']);
  });

  it('aligns the state column under its header', () => {
    const rows = secretsTable(
      [definition({ envVar: 'A_LONGER_NAME', services: ['backend', 'mcp'] }), definition({ envVar: 'B', required: true })],
      new Map(),
    );
    const lines = formatSecretsTable(rows).map((line) => stripVTControlCharacters(line));
    const header = lines[0] ?? '';

    expect(lines.slice(1).map((line, index) => line.indexOf(rows[index]?.state ?? ''))).toEqual([header.indexOf('STATE'), header.indexOf('STATE')]);
  });
});

describe('planEnvImport', () => {
  const definitions = [
    definition({ envVar: 'BREVO_API_KEY', secretName: 'brevo-api-key' }),
    definition({ envVar: 'COOKIE_SECRET', secretName: 'cookie-secret', valueSource: 'engine', generation: 'random' }),
  ];

  it.each([
    ['BREVO_API_KEY', 'xkeysib-0123456789ab', 'set (20 chars)', 'xkeysib-0123456789ab'],
    ['BREVO_API_KEY', '  pasted  ', 'set (6 chars)', 'pasted'],
    ['BREVO_API_KEY', '   ', 'empty', undefined],
    ['COOKIE_SECRET', 'from-a-dev-env', 'made by infra', undefined],
    ['FOO', 'bar', 'no such env var', undefined],
  ])('reads %s=%j as %s', (key, value, note, written) => {
    const [line] = planEnvImport([{ key, value }], definitions);

    expect(line).toMatchObject({ key, note });
    expect(line?.write?.value).toBe(written);
  });

  it('keeps one line per key, in file order with its last value, as a dotenv load does', () => {
    const lines = planEnvImport(
      [
        { key: 'BREVO_API_KEY', value: 'first' },
        { key: 'FOO', value: 'bar' },
        { key: 'BREVO_API_KEY', value: 'second' },
      ],
      definitions,
    );

    expect(lines.map((line) => [line.key, line.write?.value])).toEqual([
      ['BREVO_API_KEY', 'second'],
      ['FOO', undefined],
    ]);
  });
});
