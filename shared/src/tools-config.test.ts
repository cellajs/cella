import { describe, expect, it } from 'vitest';
import { type SlotToolsConfig, stackSlotConfigs } from './tools-config.ts';

// Layers broadest first, as an organization, a course and a project would hold them for one slot of the project.
describe('stackSlotConfigs', () => {
  it.each<[string, (SlotToolsConfig | undefined)[], SlotToolsConfig | undefined]>([
    ['no layer', [], undefined],
    ['only empty layers', [undefined, {}, { order: [], hidden: [] }], undefined],
    ['one layer as it is', [{ order: ['b', 'a'], hidden: ['c'] }], { order: ['b', 'a'], hidden: ['c'] }],
    [
      'hidden as the union of every layer, which a narrower order cannot undo',
      [{ hidden: ['a'] }, { hidden: ['b'] }, { order: ['a', 'b'], hidden: ['c'] }],
      { order: ['a', 'b'], hidden: ['a', 'b', 'c'] },
    ],
    [
      "the narrowest order first, then each broader layer's ids it leaves out",
      [{ order: ['a', 'b', 'c', 'd'] }, { order: ['c', 'b'] }, { order: ['d'] }],
      { order: ['d', 'c', 'b', 'a'], hidden: [] },
    ],
    ['an empty layer between two others changes nothing', [{ order: ['a', 'b'] }, undefined, { order: ['b'] }], { order: ['b', 'a'], hidden: [] }],
    [
      'an id named twice, in one layer or in several, once',
      [
        { order: ['a', 'a', 'b'], hidden: ['x', 'x'] },
        { order: ['b', 'b'], hidden: ['x'] },
      ],
      { order: ['b', 'a'], hidden: ['x'] },
    ],
  ])('%s', (_, layers, expected) => {
    expect(stackSlotConfigs(...layers)).toEqual(expected);
  });
});
