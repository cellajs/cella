import { describe, expect, it } from 'vitest';
import { describeChanges } from './description-diff';

const applied = {
  engine: { singleVM: false, services: { backend: { enabled: true } } },
  env: { FOO: 'a', BAR: 'b' },
  general: { database: { size: 'small' }, zones: ['nl-ams-1'] },
};

describe('describeChanges', () => {
  it.each<{ why: string; target: unknown; changes: string[] }>([
    { why: 'the same description', target: structuredClone(applied), changes: [] },
    {
      why: 'key order and layout',
      target: { general: { zones: ['nl-ams-1'], database: { size: 'small' } }, env: { BAR: 'b', FOO: 'a' }, engine: applied.engine },
      changes: [],
    },
    {
      why: 'a service added',
      target: { ...applied, services: { search: { routed: '/search' } } },
      changes: ['services added'],
    },
    {
      why: 'a nested leaf changed and a member removed',
      target: { ...applied, env: { BAR: 'b' }, general: { ...applied.general, database: { size: 'large' } } },
      changes: ['env.FOO removed', 'general.database.size changed'],
    },
    {
      why: 'an array, compared whole',
      target: { ...applied, general: { ...applied.general, zones: ['nl-ams-1', 'nl-ams-2'] } },
      changes: ['general.zones changed'],
    },
    {
      why: 'an object that became a value',
      target: { ...applied, engine: { ...applied.engine, services: false } },
      changes: ['engine.services changed'],
    },
    {
      why: 'a member set to undefined, which the canonical form leaves out',
      target: { ...applied, env: { ...applied.env, BAZ: undefined } },
      changes: [],
    },
    {
      why: 'twelve changes, of which eight are named in key order',
      target: { ...applied, env: Object.fromEntries('ABCDEFGHIJ'.split('').map((letter) => [letter, letter])) },
      changes: [
        'env.A added',
        'env.B added',
        'env.BAR removed',
        'env.C added',
        'env.D added',
        'env.E added',
        'env.F added',
        'env.FOO removed',
        '+4 more',
      ],
    },
  ])('names the leaves that differ: $why', ({ target, changes }) => {
    expect(describeChanges(applied, target)).toEqual(changes);
  });
});
