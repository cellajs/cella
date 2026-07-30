import { useQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { getSettingsAsideTools, resolvePlacementList } from '~/lib/placements';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { PageAside } from '~/modules/common/page/aside';
import { heldContextRoles } from '~/modules/entities/context-roles';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import type { EnrichedOrganization } from '~/modules/organization/types';

const slot = 'organization.settings.aside';

/**
 * Organization settings consumer: hosts the `organization.settings.aside` slot. Sections come from
 * the tool registry, arranged by app overrides and this organization's `toolsConfig`, gated on
 * grants (`requires`) and held context-role pairs (`visibleTo`).
 */
function OrganizationSettings({ organization }: { organization: EnrichedOrganization }) {
  // The settings ROUTE requires `can.organization.update`; the danger zone is gated on its
  // own action. Update and delete are distinct grants in the can map, and an app may split
  // them even though the template's admin role holds both.
  const resolveCan = useResolveCan();
  const canDelete = resolveCan(organization.can?.organization?.delete, organization.createdBy);
  const grants = canDelete ? ['update', 'delete'] : ['update'];

  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const pairs = heldContextRoles(organization, myMemberships?.items ?? []);

  const sections = resolvePlacementList(
    slot,
    getSettingsAsideTools('organization').map((tool) => ({ ...tool, order: tool.order ?? 50 })),
    { grants, pairs, channelConfig: organization.toolsConfig?.[slot] },
  );

  return (
    <div className="container mx-auto my-4 gap-4 md:flex md:flex-row">
      <div className="mx-auto flex h-auto flex-col max-md:hidden md:w-[30%] md:min-w-48">
        <div className="max-md:block! sticky top-15 z-10 max-h-[calc(100dvh-3.75rem)] overflow-y-auto md:mt-3">
          <PageAside tabs={sections} className="pb-2" />
        </div>
      </div>

      <div className="flex flex-col gap-8 md:w-[70%]">
        {sections.map((tool) => (
          <AsideAnchor key={tool.id} id={tool.id} extraOffset>
            <Suspense fallback={null}>{tool.render(organization)}</Suspense>
          </AsideAnchor>
        ))}
      </div>
    </div>
  );
}

export { OrganizationSettings };
