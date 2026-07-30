import { getModules } from 'shared/module-registry';
import { describe, expect, it } from 'vitest';
import { defineFrontendModule } from '~/lib/module';
import { getChannelSettingsTools, getTools, orderBySlotConfig, resolvePlacementList } from '~/lib/placements';

describe('tool registry', () => {
  it('indexes module tools by slot, sorted on order with a default of 50', () => {
    defineFrontendModule({
      name: 'test-tools',
      owner: 'app',
      scope: ['frontend'],
      description: 'Tool registry test module.',
      tools: [
        { slot: 'organization.settings', id: 'last', label: 'c:last', order: 60, render: () => null },
        { slot: 'organization.settings', id: 'first', label: 'c:first', order: 10, render: () => null },
        { slot: 'organization.settings', id: 'middle', label: 'c:middle', render: () => null },
      ],
    });

    const ids = getChannelSettingsTools('organization').map((tool) => tool.id);
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
      tools: [{ slot: 'account.settings', id: 'api-tokens', label: 'c:api_tokens', render: () => null }],
    });

    expect(getTools('account.settings').map((tool) => tool.id)).toEqual(['api-tokens']);
    expect(getChannelSettingsTools('organization').some((tool) => tool.id === 'api-tokens')).toBe(false);
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
            label: 'c:bad',
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
    { id: 'a', label: 'c:a', order: 10 },
    { id: 'b', label: 'c:b', order: 20 },
    { id: 'c', label: 'c:c', order: 30 },
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

describe('resolvePlacementList', () => {
  const items = [
    { id: 'general', label: 'c:general', order: 10, locked: true },
    { id: 'danger', label: 'c:danger', order: 90, requires: 'delete', locked: true },
    { id: 'extra', label: 'c:extra', order: 50 },
    { id: 'staff-only', label: 'c:staff', order: 40, visibleTo: ['organization.admin' as const] },
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

  it('applies app overrides: hide (even locked), reorder, re-gate', () => {
    const resolved = resolvePlacementList('host', items, {
      grants: ['update'],
      pairs: ['organization.member'],
      overrides: {
        host: {
          general: { hidden: true },
          danger: { requires: 'update', order: 5 },
          'staff-only': { visibleTo: ['organization.member'] },
        },
      },
    });
    // locked 'general' still hidden by the code layer; 'danger' re-gated onto update and moved first;
    // 'staff-only' re-targeted at members
    expect(resolved.map((i) => i.id)).toEqual(['danger', 'staff-only', 'extra']);
  });
});
