import { getModules } from 'shared/module-registry';
import { assumeNoSurfaces, withSurface } from 'shared/testing/surfaces';
import { describe, expect, it } from 'vitest';
import type { TKey } from '~/lib/i18n-locales';
import { defineFrontendModule } from '~/lib/module';
import { assertSurfaceIds, getTools, isPlacementHidden, orderBySlotConfig, resolvePlacementList } from '~/lib/placements';

// Fixtures use synthetic labels that are not real translation keys.
const key = (s: string) => s as TKey;

assumeNoSurfaces();

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

const slot = 'organization.settings' as const;

describe('isPlacementHidden', () => {
  const item = { id: 'extra', label: key('c:extra'), order: 50 };

  it('reports channel-stored hiding, with locked immune to it', () => {
    const slotConfig = { order: [], hidden: ['extra'] };
    expect(isPlacementHidden(slot, item, { slotConfig })).toBe(true);
    expect(isPlacementHidden(slot, { ...item, locked: true }, { slotConfig })).toBe(false);
    expect(isPlacementHidden(slot, item, {})).toBe(false);
  });

  it('hides an id the app left out of the surface list, locked included', () => {
    withSurface(slot, ['general'], () => {
      expect(isPlacementHidden(slot, item, {})).toBe(true);
      expect(isPlacementHidden(slot, { ...item, locked: true }, {})).toBe(true);
      expect(isPlacementHidden(slot, { id: 'general', label: key('c:general'), order: 10 }, {})).toBe(false);
    });
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
    expect(resolvePlacementList(slot, items).map((i) => i.id)).toEqual(['general', 'extra']);
    const full = resolvePlacementList(slot, items, { grants: ['delete'], pairs: ['organization.admin'] });
    expect(full.map((i) => i.id)).toEqual(['general', 'staff-only', 'extra', 'danger']);
  });

  it('applies channel config hiding and ordering, with locked immune to hiding', () => {
    const resolved = resolvePlacementList(slot, items, {
      grants: ['delete'],
      pairs: ['organization.admin'],
      slotConfig: { order: ['danger', 'general'], hidden: ['extra', 'general'] },
    });
    // 'extra' hides; locked 'general' survives its hidden entry; stored order wins
    expect(resolved.map((i) => i.id)).toEqual(['danger', 'general', 'staff-only']);
  });

  it('a listed surface decides which placements exist and their order, declared order ignored', () => {
    withSurface(slot, ['danger', 'general'], () => {
      const resolved = resolvePlacementList(slot, items, { grants: ['delete'], pairs: ['organization.admin'] });
      expect(resolved.map((i) => i.id)).toEqual(['danger', 'general']);
    });
  });

  it('the channel stored order still reorders within a listed surface', () => {
    withSurface(slot, ['danger', 'general', 'extra'], () => {
      const resolved = resolvePlacementList(slot, items, { grants: ['delete'], slotConfig: { order: ['extra'] } });
      expect(resolved.map((i) => i.id)).toEqual(['extra', 'danger', 'general']);
    });
  });
});

describe('assertSurfaceIds', () => {
  it('throws for an id the surface has no placement for, and passes once it does', () => {
    withSurface(slot, ['general', 'ghost'], () => {
      expect(() => assertSurfaceIds(() => ['general'])).toThrowError(/lists 'ghost', which is no placement/);
      expect(() => assertSurfaceIds(() => ['general', 'ghost'])).not.toThrow();
    });
  });
});
