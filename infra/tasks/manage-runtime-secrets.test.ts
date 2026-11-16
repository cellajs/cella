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
    { state: 'missing · required', mark: '✗', secret: { required: true }, container: undefined },
    { state: 'empty', mark: '○', secret: {}, container: { version_count: 0 } },
    { state: 'set Nov 8', mark: '●', secret: {}, container: { version_count: 2, setAt: '2026-11-08T12:00:00Z' } },
  ] as const)('reads $state', ({ state, mark, secret, container }) => {
    const rows = secretsTable([definition(secret)], new Map(container ? [['x', container]] : []));

    expect(rows.map((row) => row.state)).toEqual([state]);
    expect(stripVTControlCharacters(formatSecretsTable(rows)[0] ?? '')).toMatch(new RegExp(`^${mark} X +backend +${state}$`));
  });

  it('lists the values of one group as one row: the services of all, set once every value is, the count of set ones before', () => {
    const pair = [
      definition({ envVar: 'A_ID', secretName: 'a-id', group: 'A sign-in' }),
      definition({ envVar: 'A_SECRET', secretName: 'a-secret', group: 'A sign-in', services: ['mcp'] }),
    ];
    const first = { version_count: 1, setAt: '2026-11-02T12:00:00Z' };

    expect(secretsTable(pair, new Map([['a-id', first]]))).toMatchObject([
      { label: 'A sign-in', usedBy: 'backend, mcp', kind: 'partial', state: '1 of 2 set' },
    ]);
    expect(
      secretsTable(
        pair,
        new Map([
          ['a-id', first],
          ['a-secret', { version_count: 1, setAt: '2026-11-08T12:00:00Z' }],
        ]),
      ),
    ).toMatchObject([{ kind: 'set', state: 'set Nov 8' }]);
  });

  it('puts rows that miss a required value first, then set, partly set and empty ones, in registry order, and none for values infra makes', () => {
    const rows = secretsTable(
      [
        definition({ envVar: 'ENGINE', secretName: 'engine', valueSource: 'engine' }),
        definition({ envVar: 'SET', secretName: 'set' }),
        definition({ envVar: 'OPTIONAL', secretName: 'optional' }),
        definition({ envVar: 'REQUIRED', secretName: 'required', required: true }),
        definition({ envVar: 'PART_A', secretName: 'part-a', group: 'Part' }),
        definition({ envVar: 'PART_B', secretName: 'part-b', group: 'Part' }),
      ],
      new Map([
        ['set', { version_count: 1 }],
        ['part-a', { version_count: 1 }],
      ]),
    );

    expect(rows.map((row) => row.label)).toEqual(['REQUIRED', 'SET', 'Part', 'OPTIONAL']);
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
