import { TrashIcon } from 'lucide-react';
import { type ReactNode, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import type { PlacementDescriptor } from '~/lib/placements';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { NamedText } from '~/modules/common/named-text';
import { ToolCard } from '~/modules/common/tool-card';
import { Button } from '~/modules/ui/button';

/** Bases a module spreads into its `tools` with a `slot` and a `render`. Orders: general 10, details 20, tabs 80, danger 90; module tools default to 50. */
export const generalToolBase = {
  id: 'general',
  label: 'c:general',
  order: 10,
  locked: true,
  requires: 'update',
} satisfies PlacementDescriptor;

export const detailsToolBase = { id: 'details', label: 'c:details', order: 20 } satisfies PlacementDescriptor;

export const tabsToolBase = {
  id: 'tabs',
  label: 'c:tabs',
  order: 80,
  locked: true,
  requires: 'update',
} satisfies PlacementDescriptor;

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
  renderDialog: () => ReactNode;
  /** The card's notice; defaults to the permanent-delete notice, interpolated with `name`, `resource` and `values`. */
  notice?: TKey;
  values?: Record<string, string | number>;
}

export function DeleteToolCard({ name, resource, dialogId, renderDialog, notice = 'c:delete_resource_notice.text', values }: DeleteToolCardProps) {
  const { t } = useTranslation();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const resourceName = t(resource).toLowerCase();

  const openDeleteDialog = () => {
    // Suspense: dialog content is typically a lazy-loaded per-entity component
    dialoger.getState().create(<Suspense fallback={null}>{renderDialog()}</Suspense>, {
      id: dialogId,
      triggerRef: deleteButtonRef,
      className: 'md:max-w-xl',
      title: t('c:delete_resource', { resource: resourceName }),
      description: <NamedText i18nKey="c:confirm.delete_resource" name={name} values={{ resource: resourceName }} />,
    });
  };

  return (
    <ToolCard
      label="c:delete_resource"
      resource={resource}
      description={<NamedText i18nKey={notice} name={name} values={{ resource: resourceName, ...values }} />}
    >
      <Button ref={deleteButtonRef} variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
        <TrashIcon />
        <span>{t('c:delete_resource', { resource: resourceName })}</span>
      </Button>
    </ToolCard>
  );
}
