import { useQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { appConfig, type ChannelEntityType } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import { type ChannelEntityContext, getChannelSettingsTools, resolvePlacementList } from '~/lib/placements';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { PageAside } from '~/modules/common/page/aside';
import { heldContextRoles } from '~/modules/entities/context-roles';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { myMembershipsQueryOptions } from '~/modules/me/query';

interface ChannelSettingsPageProps<C extends ChannelEntityType> {
  entity: ChannelEntityContext<C> & { entityType: C; toolsConfig?: ToolsConfig };
}

/**
 * Generic settings consumer for a channel entity: hosts its `settings` slot. Sections come
 * from the tool registry, arranged by app overrides and the entity's `toolsConfig`, gated on the
 * actor's resolved action grants (`requires`) and held context-role pairs (`visibleTo`).
 */
export function ChannelSettingsPage<C extends ChannelEntityType>({ entity }: ChannelSettingsPageProps<C>) {
  const channelType = entity.entityType;
  const slot = `${channelType}.settings`;

  // Grants: every entity action the actor holds on this channel, resolved per row
  const resolveCan = useResolveCan();
  const can = entity.can?.[channelType];
  const grants = appConfig.entityActions.filter((action) => resolveCan(can?.[action], entity.createdBy));

  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const pairs = heldContextRoles(entity, myMemberships?.items ?? []);

  const sections = resolvePlacementList(
    slot,
    getChannelSettingsTools(channelType).map((tool) => ({ ...tool, order: tool.order ?? 50 })),
    { grants, pairs, slotConfig: entity.toolsConfig?.[slot] },
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
            <Suspense fallback={null}>{tool.render(entity)}</Suspense>
          </AsideAnchor>
        ))}
      </div>
    </div>
  );
}
