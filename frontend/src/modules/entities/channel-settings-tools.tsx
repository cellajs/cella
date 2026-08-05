import { TrashIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Suspense, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import type { PlacementDescriptor } from '~/lib/placements';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { ToolCard } from '~/modules/common/tool-card';
import { Button } from '~/modules/ui/button';

/**
 * The general form tool base: first section, locked, held to the update grant. The bases in this
 * file are pure data for the standard settings tool set: a module spreads one into its `tools`
 * array and attaches the `slot`, app conditions (`visibleTo` audiences, adjusted `requires`), and
 * a `render` returning the full card. Deviating from the standard set means declaring a different
 * tool. Order convention: general 10, details 20, tabs 80, danger zone 90; module tools default
 * to 50.
 */
export const generalToolBase = {
  id: 'general',
  label: 'c:general',
  order: 10,
  locked: true,
  requires: 'update',
} satisfies PlacementDescriptor;

/** The details form tool: hideable and reorderable per channel. */
export const detailsToolBase = {
  id: 'details',
  label: 'c:details',
  order: 20,
} satisfies PlacementDescriptor;

/**
 * The tabs-management admin card (`TabsArrangementCard` wired to the channel's update mutation
 * and its tabbed surface): drag-reorder and visibility toggles for the channel's page tabs.
 */
export const tabsToolBase = {
  id: 'tabs',
  label: 'c:tabs',
  order: 80,
  locked: true,
  requires: 'update',
} satisfies PlacementDescriptor;

/** The danger-zone tool for one channel type: last section, locked, held to the delete grant. */
export function dangerToolBase(channelType: ChannelEntityType, resource: TKey): PlacementDescriptor {
  return {
    id: `delete-${channelType}`,
    label: 'c:delete_resource',
    resource,
    order: 90,
    locked: true,
    requires: 'delete',
  };
}

interface DeleteToolCardProps {
  /** Entity display name, interpolated into the notice and confirm texts. */
  name: string;
  /** i18n resource key for the entity, e.g. 'c:organization'. */
  resource: TKey;
  /** Dialog id, also the aside anchor's danger id (e.g. 'delete-organization'). */
  dialogId: string;
  /** Renders the per-entity delete confirmation content inside the dialog. */
  renderDialog: () => ReactNode;
}

/** The standard danger-zone tool card: a free-form ToolCard body with the confirm-dialog delete button. */
export function DeleteToolCard({ name, resource, dialogId, renderDialog }: DeleteToolCardProps) {
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
