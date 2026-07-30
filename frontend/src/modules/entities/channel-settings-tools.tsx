import type { ReactNode } from 'react';
import type { ChannelEntityType } from 'shared';
import type { ContextRole } from 'shared/tools-config';
import type { SettingsAsideEntity, SettingsAsideToolFor } from '~/lib/placements';
import { SettingsToolCard } from '~/modules/common/settings-tool-card';
import { DangerZoneCard } from '~/modules/entities/danger-zone-card';

interface ChannelSettingsToolsInput<C extends ChannelEntityType> {
  channelType: C;
  /** i18n resource key for the entity, e.g. 'c:organization'. */
  resource: string;
  /** Who may see the admin tools-arrangement card (elevation is explicit: list every pair). */
  toolsCardVisibleTo: ContextRole[];
  /** Renders the general form body (standard unsaved-badge card provided). */
  renderGeneral: (entity: SettingsAsideEntity<C>) => ReactNode;
  /** Renders the details form body; omit to skip the details tool. */
  renderDetails?: (entity: SettingsAsideEntity<C>) => ReactNode;
  /** Renders the tools-arrangement card, wired to the channel's update mutation. */
  renderTools: (entity: SettingsAsideEntity<C>) => ReactNode;
  /** Renders the danger-zone delete confirmation content (standard card and dialog provided). */
  renderDeleteDialog: (entity: SettingsAsideEntity<C>) => ReactNode;
}

/**
 * The standard settings tool set for one channel type: general (10, locked), details (20),
 * tools arrangement (80, locked, admin-gated) and danger zone (90, locked, delete-gated).
 * Returns plain tool declarations for the module's `tools` array, so a channel's settings slot
 * costs its forms plus this one call.
 */
export function channelSettingsTools<C extends ChannelEntityType>(
  input: ChannelSettingsToolsInput<C>,
): SettingsAsideToolFor<C>[] {
  const { channelType, resource, toolsCardVisibleTo, renderGeneral, renderDetails, renderTools, renderDeleteDialog } =
    input;
  const slot: `${C}.settings.aside` = `${channelType}.settings.aside`;

  return [
    {
      slot,
      id: 'general',
      label: 'c:general',
      order: 10,
      locked: true,
      render: (entity) => (
        <SettingsToolCard label="c:general" unsaved id={`update-${channelType}`}>
          {renderGeneral(entity)}
        </SettingsToolCard>
      ),
    },
    ...(renderDetails
      ? [
          {
            slot,
            id: 'details',
            label: 'c:details',
            order: 20,
            render: (entity: SettingsAsideEntity<C>) => (
              <SettingsToolCard label="c:details" id={`update-${channelType}-details`}>
                {renderDetails(entity)}
              </SettingsToolCard>
            ),
          },
        ]
      : []),
    {
      slot,
      id: 'tools',
      label: 'c:tools',
      order: 80,
      locked: true,
      requires: 'update',
      visibleTo: toolsCardVisibleTo,
      render: renderTools,
    },
    {
      slot,
      id: `delete-${channelType}`,
      label: 'c:delete_resource',
      resource,
      order: 90,
      locked: true,
      requires: 'delete',
      render: (entity) => (
        <DangerZoneCard
          name={entity.name}
          resource={resource}
          dialogId={`delete-${channelType}`}
          renderDialog={() => renderDeleteDialog(entity)}
        />
      ),
    },
  ];
}
