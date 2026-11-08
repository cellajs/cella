import { useQuery } from '@tanstack/react-query';
import { type ReactNode, Suspense } from 'react';
import { appConfig, type ChannelEntityType } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import { type ChannelEntityContext, getTools, type PlacementDescriptor, resolvePlacementList } from '~/lib/placements';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { PageAside } from '~/modules/common/page/aside';
import { heldContextRoles } from '~/modules/entities/context-roles';
import { useCan } from '~/modules/entities/use-can';
import { myMembershipsQueryOptions } from '~/modules/me/query';

type ChannelSettingsHost<C extends ChannelEntityType> = ChannelEntityContext<C> & { entityType: C; toolsConfig: ToolsConfig };

type ChannelSettingsSection<C extends ChannelEntityType> = PlacementDescriptor & {
  order: number;
  render: (entity: ChannelEntityContext<C>) => ReactNode;
};

/**
 * The `${channelType}.settings` tools, ordered by the app config and the row's `toolsConfig`, gated on grants and
 * context-role pairs. On an archived channel `update` is no grant: the tools that need it hide, and those that need
 * `archive` or `delete` stay.
 */
function useChannelSettingsSections<C extends ChannelEntityType>(entity: ChannelSettingsHost<C>): ChannelSettingsSection<C>[] {
  const channelType = entity.entityType;
  const slot: `${C}.settings` = `${channelType}.settings`;

  const can = useCan();
  const canIgnoringArchive = useCan({ ignoreArchive: true });
  const grants = [
    ...appConfig.entityActions.filter((action) => can(action, channelType, entity)),
    ...(canIgnoringArchive('update', channelType, entity) ? (['archive'] as const) : []),
  ];

  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const pairs = heldContextRoles(entity, myMemberships?.results ?? []);

  // Cast: registered settings tools carry a render the descriptor type erases
  const tools = getTools(slot) as ChannelSettingsSection<C>[];

  return resolvePlacementList(slot, tools, { grants, pairs, slotConfig: entity.toolsConfig[slot] });
}

interface ChannelSettingsPageProps<C extends ChannelEntityType> {
  entity: ChannelSettingsHost<C>;
}

export function ChannelSettingsPage<C extends ChannelEntityType>({ entity }: ChannelSettingsPageProps<C>) {
  const sections = useChannelSettingsSections(entity);

  return (
    <div className="my-4 gap-4 md:flex">
      <div className="max-md:hidden md:w-3/10 md:min-w-48">
        <div className="sticky top-15 z-10 max-h-[calc(100dvh-3.75rem)] overflow-y-auto p-1 md:mt-2">
          <PageAside tabs={sections} className="pb-2" />
        </div>
      </div>

      <div className="flex flex-col gap-8 md:w-7/10">
        {sections.map((section) => (
          <AsideAnchor key={section.id} id={section.id}>
            <Suspense fallback={null}>{section.render(entity)}</Suspense>
          </AsideAnchor>
        ))}
      </div>
    </div>
  );
}
