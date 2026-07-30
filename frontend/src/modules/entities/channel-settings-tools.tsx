import { TrashIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Suspense, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import type { ContextRole } from 'shared/tools-config';
import type { ChannelEntityContext, ChannelSettingsToolFor } from '~/lib/placements';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { ToolCard } from '~/modules/common/tool-card';
import { Button } from '~/modules/ui/button';

interface DeleteToolCardProps {
  /** Entity display name, interpolated into the notice and confirm texts. */
  name: string;
  /** i18n resource key for the entity, e.g. 'c:organization'. */
  resource: string;
  /** Dialog id, also the aside anchor's danger id (e.g. 'delete-organization'). */
  dialogId: string;
  /** Renders the per-entity delete confirmation content inside the dialog. */
  renderDialog: () => ReactNode;
}

/** The standard danger-zone tool: a free-form ToolCard body with the confirm-dialog delete button. */
function DeleteToolCard({ name, resource, dialogId, renderDialog }: DeleteToolCardProps) {
  const { t } = useTranslation();
  const deleteButtonRef = useRef(null);

  const resourceName = t(resource).toLowerCase();

  const openDeleteDialog = () => {
    // Suspense: dialog content is typically a lazy-loaded per-entity component
    useDialoger.getState().create(<Suspense fallback={null}>{renderDialog()}</Suspense>, {
      id: dialogId,
      triggerRef: deleteButtonRef,
      className: 'md:max-w-xl',
      title: t('c:delete_resource', { resource: resourceName }),
      description: t('c:confirm.delete_resource', { name, resource: resourceName }),
    });
  };

  return (
    <ToolCard
      label="c:delete_resource"
      resource={resource}
      description={<Trans t={t} i18nKey="c:delete_resource_notice.text" values={{ name, resource: resourceName }} />}
    >
      <Button ref={deleteButtonRef} variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
        <TrashIcon className="mr-2 size-4" />
        <span>{t('c:delete_resource', { resource: resourceName })}</span>
      </Button>
    </ToolCard>
  );
}

interface ChannelSettingsToolsInput<C extends ChannelEntityType> {
  channelType: C;
  /** i18n resource key for the entity, e.g. 'c:organization'. */
  resource: string;
  /** Who may see the admin tools-arrangement card (elevation is explicit: list every pair). */
  toolsCardVisibleTo: ContextRole[];
  /** Renders the general form body (standard unsaved-badge card provided). */
  renderGeneral: (entity: ChannelEntityContext<C>) => ReactNode;
  /** Renders the details form body; omit to skip the details tool. */
  renderDetails?: (entity: ChannelEntityContext<C>) => ReactNode;
  /** Renders the tools-arrangement card, wired to the channel's update mutation. */
  renderTools: (entity: ChannelEntityContext<C>) => ReactNode;
  /** Renders the danger-zone delete confirmation content (standard card and dialog provided). */
  renderDeleteDialog: (entity: ChannelEntityContext<C>) => ReactNode;
}

/**
 * The standard settings tool set for one channel type: general (10, locked), details (20),
 * tools arrangement (80, locked, admin-gated) and danger zone (90, locked, delete-gated).
 * Returns plain tool declarations for the module's `tools` array, so a channel's settings slot
 * costs its forms plus this one call.
 */
export function channelSettingsTools<C extends ChannelEntityType>(
  input: ChannelSettingsToolsInput<C>,
): ChannelSettingsToolFor<C>[] {
  const { channelType, resource, toolsCardVisibleTo, renderGeneral, renderDetails, renderTools, renderDeleteDialog } =
    input;
  const slot: `${C}.settings` = `${channelType}.settings`;

  return [
    {
      slot,
      id: 'general',
      label: 'c:general',
      order: 10,
      locked: true,
      render: (entity) => (
        <ToolCard label="c:general" unsaved id={`update-${channelType}`}>
          {renderGeneral(entity)}
        </ToolCard>
      ),
    },
    ...(renderDetails
      ? [
          {
            slot,
            id: 'details',
            label: 'c:details',
            order: 20,
            render: (entity: ChannelEntityContext<C>) => (
              <ToolCard label="c:details" id={`update-${channelType}-details`}>
                {renderDetails(entity)}
              </ToolCard>
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
        <DeleteToolCard
          name={entity.name}
          resource={resource}
          dialogId={`delete-${channelType}`}
          renderDialog={() => renderDeleteDialog(entity)}
        />
      ),
    },
  ];
}
