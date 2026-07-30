import { getModules } from 'shared/module-registry';
import { describe, expect, it } from 'vitest';
import { defineFrontendModule } from '~/lib/module';
import { getPlacements, resolvePlacementList } from '~/lib/placements';

describe('placement registry', () => {
  it('indexes module placements by slot, sorted on order with a default of 50', () => {
    defineFrontendModule({
      name: 'test-placements',
      owner: 'app',
      scope: ['frontend'],
      description: 'Placement registry test module.',
      placements: [
        { slot: 'organization.settings.aside', id: 'last', label: 'c:last', order: 60, render: () => null },
        { slot: 'organization.settings.aside', id: 'first', label: 'c:first', order: 10, render: () => null },
        { slot: 'organization.settings.aside', id: 'middle', label: 'c:middle', render: () => null },
      ],
    });

    const ids = getPlacements('organization.settings.aside').map((placement) => placement.id);
    expect(ids).toEqual(['first', 'middle', 'last']);
  });

  it('forwards metadata to the shared module registry without capability fields', () => {
    const metadata = getModules({ scope: 'frontend' }).find((m) => m.name === 'test-placements');
    expect(metadata).toBeDefined();
    expect(metadata && 'placements' in metadata).toBe(false);
  });

  it('indexes account slot contributions separately from channel slots', () => {
    defineFrontendModule({
      name: 'test-account-placements',
      owner: 'app',
      scope: ['frontend'],
      description: 'Account placement registry test module.',
      placements: [{ slot: 'account.settings.aside', id: 'api-tokens', label: 'c:api_tokens', render: () => null }],
    });

    expect(getPlacements('account.settings.aside').map((p) => p.id)).toEqual(['api-tokens']);
    expect(getPlacements('organization.settings.aside').some((p) => p.id === 'api-tokens')).toBe(false);
  });
});

describe('resolvePlacementList', () => {
  const items = [
    { id: 'general', label: 'c:general', order: 10 },
    { id: 'danger', label: 'c:danger', order: 90, requires: 'delete' },
    { id: 'extra', label: 'c:extra', order: 50 },
  ];

  it('drops entries whose required grant is absent and sorts on order', () => {
    expect(resolvePlacementList('host', items).map((i) => i.id)).toEqual(['general', 'extra']);
    expect(resolvePlacementList('host', items, ['delete']).map((i) => i.id)).toEqual(['general', 'extra', 'danger']);
  });

  it('applies hide, reorder, and re-gate overrides for the host', () => {
    const overrides = {
      host: { extra: { hidden: true }, danger: { order: 5, requires: 'update' } },
      other: { general: { hidden: true } },
    };
    const resolved = resolvePlacementList('host', items, ['update'], overrides);
    expect(resolved.map((i) => i.id)).toEqual(['danger', 'general']);
  });
});
