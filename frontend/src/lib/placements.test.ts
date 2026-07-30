import { getModules } from 'shared/module-registry';
import { describe, expect, it } from 'vitest';
import { defineFrontendModule } from '~/lib/module';
import { getPlacements } from '~/lib/placements';

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
});
