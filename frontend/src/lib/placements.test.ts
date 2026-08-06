import { getModules } from 'shared/module-registry';
import { describe, expect, it } from 'vitest';
import type { TKey } from '~/lib/i18n-locales';
import { defineFrontendModule } from '~/lib/module';
import { getTools, isPlacementHidden, orderBySlotConfig, resolvePlacementList } from '~/lib/placements';

// Fixtures use synthetic labels that are not real translation keys.
const key = (s: string) => s as TKey;

describe('tool registry', () => {
  it('indexes module tools by slot, sorted on order with a default of 50', () => {
    defineFrontendModule({
      name: 'test-tools',
      owner: 'app',
      scope: ['frontend'],
      description: 'Tool registry test module.',
      tools: [
        { slot: 'organization.settings', id: 'last', label: key('c:last'), order: 60, render: () => null },
        { slot: 'organization.settings', id: 'first', label: key('c:first'), order: 10, render: () => null },
        { slot: 'organization.settings', id: 'middle', label: key('c:middle'), render: () => null },
      ],
    });

    const ids = getTools('organization.settings').map((tool) => tool.id);
    expect(ids).toEqual(['first', 'middle', 'last']);
  });

  it('forwards metadata to the shared module registry without capability fields', () => {
    const metadata = getModules({ scope: 'frontend' }).find((m) => m.name === 'test-tools');
    expect(metadata).toBeDefined();
    expect(metadata && 'tools' in metadata).toBe(false);
  });

  it('indexes account slot tools separately from channel slots', () => {
    defineFrontendModule({
      name: 'test-account-tools',
      owner: 'app',
      scope: ['frontend'],
      description: 'Account tool registry test module.',
      tools: [{ slot: 'account.settings', id: 'api-tokens', label: key('c:api_tokens'), render: () => null }],
    });

    expect(getTools('account.settings').map((tool) => tool.id)).toEqual(['api-tokens']);
    expect(getTools('organization.settings').some((tool) => tool.id === 'api-tokens')).toBe(false);
  });

  it('rejects context-role pairs that name no hierarchy role', () => {
    expect(() =>
      defineFrontendModule({
        name: 'test-bad-pair',
        owner: 'app',
        scope: ['frontend'],
        description: 'Invalid pair test module.',
        tools: [
          {
            slot: 'organization.settings',
            id: 'bad',
            label: key('c:bad'),
            // Cast: the invalid pair is the point of this test
            visibleTo: ['organization.owner' as 'organization.admin'],
            render: () => null,
          },
        ],
      }),
    ).toThrowError(/invalid context-role pair/);
  });
});

describe('orderBySlotConfig', () => {
  const items = [
    { id: 'a', label: key('c:a'), order: 10 },
    { id: 'b', label: key('c:b'), order: 20 },
    { id: 'c', label: key('c:c'), order: 30 },
  ];

  it('puts stored ids first in stored sequence, appends unlisted by declared order', () => {
    const ordered = orderBySlotConfig(items, { order: ['c', 'a'] });
    expect(ordered.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('ignores stored ids with no matching placement', () => {
    const ordered = orderBySlotConfig(items, { order: ['removed-tool', 'b'] });
    expect(ordered.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('isPlacementHidden', () => {
  const item = { id: 'extra', label: key('c:extra'), order: 50 };

  it('reports channel-stored hiding, with locked immune to it', () => {
    const slotConfig = { order: [], hidden: ['extra'] };
    expect(isPlacementHidden('host', item, { overrides: {}, slotConfig })).toBe(true);
    expect(isPlacementHidden('host', { ...item, locked: true }, { overrides: {}, slotConfig })).toBe(false);
    expect(isPlacementHidden('host', item, { overrides: {} })).toBe(false);
  });

  it('reports app-override hiding even for locked placements', () => {
    const overrides = { host: { extra: { hidden: true } } };
    expect(isPlacementHidden('host', { ...item, locked: true }, { overrides })).toBe(true);
    expect(isPlacementHidden('other-host', item, { overrides })).toBe(false);
  });
});

describe('resolvePlacementList', () => {
  const items = [
    { id: 'general', label: key('c:general'), order: 10, locked: true },
    { id: 'danger', label: key('c:danger'), order: 90, requires: 'delete', locked: true },
    { id: 'extra', label: key('c:extra'), order: 50 },
    { id: 'staff-only', label: key('c:staff'), order: 40, visibleTo: ['organization.admin' as const] },
  ];

  it('drops entries whose required grant or visibleTo pair is absent', () => {
    expect(resolvePlacementList('host', items, { overrides: {} }).map((i) => i.id)).toEqual(['general', 'extra']);
    const full = resolvePlacementList('host', items, {
      overrides: {},
      grants: ['delete'],
      pairs: ['organization.admin'],
    });
    expect(full.map((i) => i.id)).toEqual(['general', 'staff-only', 'extra', 'danger']);
  });

  it('applies channel config hiding and ordering, with locked immune to hiding', () => {
    const resolved = resolvePlacementList('host', items, {
      overrides: {},
      grants: ['delete'],
      pairs: ['organization.admin'],
      slotConfig: { order: ['danger', 'general'], hidden: ['extra', 'general'] },
    });
    // 'extra' hides; locked 'general' survives its hidden entry; stored order wins
    expect(resolved.map((i) => i.id)).toEqual(['danger', 'general', 'staff-only']);
  });

  it('applies app overrides: hide (even locked) and reorder', () => {
    const resolved = resolvePlacementList('host', items, {
      grants: ['delete'],
      pairs: ['organization.admin'],
      overrides: {
        host: {
          general: { hidden: true },
          danger: { order: 5 },
        },
      },
    });
    // locked 'general' still hidden by the code layer; 'danger' moved first by the order override
    expect(resolved.map((i) => i.id)).toEqual(['danger', 'staff-only', 'extra']);
  });
});
