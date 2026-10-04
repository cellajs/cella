import { BoxIcon } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { getChannelListQueries, getChannelListQuery, getMemberStatIcon, getMenuSection, isMemberCountHidden } from '~/lib/entity-modules';
import { defineFrontendModule } from '~/lib/module';

const listQuery = () => ({ queryKey: ['organization', 'list'] });

describe('entity module declarations', () => {
  it('reads a channel back by entity type, with the entity type folded into its menu section', () => {
    defineFrontendModule({
      name: 'organizations',
      owner: 'cella',
      scope: ['frontend'],
      description: 'test',
      channel: { entityType: 'organization', menuSection: { label: 'c:organization_other' }, listQuery },
    });

    expect(getMenuSection('organization')).toEqual({ label: 'c:organization_other', entityType: 'organization' });
    expect(getChannelListQuery('organization')).toBe(listQuery);
    expect(getChannelListQueries()).toEqual({ organization: listQuery });
  });

  it('holds the map identity between calls, so the search sheet keeps its hook order', () => {
    expect(getChannelListQueries()).toBe(getChannelListQueries());
  });

  it('reads a product icon back and reports no hidden count by default', () => {
    defineFrontendModule({
      name: 'attachments',
      owner: 'cella',
      scope: ['frontend'],
      description: 'test',
      product: { entityType: 'attachment', memberStatIcon: BoxIcon },
    });

    expect(getMemberStatIcon('attachment')).toBe(BoxIcon);
    expect(isMemberCountHidden('attachment')).toBe(false);
  });

  it('hides the member count of an entity that asks for it', () => {
    defineFrontendModule({
      name: 'hidden-count',
      owner: 'app',
      scope: ['frontend'],
      description: 'test',
      product: { entityType: 'attachment', hiddenMemberCount: true },
    });

    expect(isMemberCountHidden('attachment')).toBe(true);
  });

  it('rejects an entity type the hierarchy has no channel or product for', () => {
    const declare = () =>
      defineFrontendModule({
        name: 'ghosts',
        owner: 'app',
        scope: ['frontend'],
        description: 'test',
        // A cast, so the test can hand the registry an entity type the hierarchy has to reject.
        channel: { entityType: 'ghost' as any },
      });

    expect(declare).toThrow(/no channel in the hierarchy/);
  });
});
