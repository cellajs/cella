import { TrashIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Suspense, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SettingsToolCard } from '~/modules/common/settings-tool-card';
import { Button } from '~/modules/ui/button';

interface DangerZoneCardProps {
  /** Entity display name, interpolated into the notice and confirm texts. */
  name: string;
  /** i18n resource key for the entity, e.g. 'c:organization'. */
  resource: string;
  /** Dialog id, also the aside anchor's danger id (e.g. 'delete-organization'). */
  dialogId: string;
  /** Renders the per-entity delete confirmation content inside the dialog. */
  renderDialog: () => ReactNode;
}

/** Standard channel danger-zone card: destructive delete button behind a confirm dialog. */
export function DangerZoneCard({ name, resource, dialogId, renderDialog }: DangerZoneCardProps) {
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
    <SettingsToolCard
      label="c:delete_resource"
      resource={resource}
      description={<Trans t={t} i18nKey="c:delete_resource_notice.text" values={{ name, resource: resourceName }} />}
    >
      <Button ref={deleteButtonRef} variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
        <TrashIcon className="mr-2 size-4" />
        <span>{t('c:delete_resource', { resource: resourceName })}</span>
      </Button>
    </SettingsToolCard>
  );
}
