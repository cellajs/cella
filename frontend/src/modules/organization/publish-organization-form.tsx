import { onlineManager } from '@tanstack/react-query';
import { RocketIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { useOrganizationPublishMutation } from '~/modules/organization/query';
import { Button } from '~/modules/ui/button';

interface PublishOrganizationFormProps {
  organization: Pick<Organization, 'id' | 'name' | 'tenantId'>;
  close: () => void;
}

/** The publish dialog's buttons; the toast says how many held invitations went out. */
export function PublishOrganizationForm({ organization, close }: PublishOrganizationFormProps) {
  const { t } = useTranslation();
  const { mutate, isPending } = useOrganizationPublishMutation();

  const publish = () => {
    if (!onlineManager.isOnline()) return toastOffline();
    mutate(
      { path: { tenantId: organization.tenantId, id: organization.id } },
      {
        onSuccess: ({ invitationsSent }) => {
          const description = invitationsSent ? t('c:invitations_sent', { count: invitationsSent }) : undefined;
          toaster.success(t('c:success.publish_resource', { name: organization.name }), { description });
          close();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button onClick={publish} loading={isPending}>
        <RocketIcon className="size-3.5" />
        {t('c:publish')}
      </Button>
      <Button type="reset" variant="secondary" onClick={close}>
        {t('c:cancel')}
      </Button>
    </div>
  );
}
