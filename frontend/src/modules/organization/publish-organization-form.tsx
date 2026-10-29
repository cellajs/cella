import { RocketIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { ConfirmForm } from '~/modules/common/confirm-form';
import { toaster } from '~/modules/common/toaster/toaster';
import { useOrganizationPublishMutation } from '~/modules/organization/query';

interface PublishOrganizationFormProps {
  organization: Pick<Organization, 'id' | 'name' | 'tenantId'>;
  close: () => void;
}

/** The publish confirmation; the toast says how many held invitations went out. */
export function PublishOrganizationForm({ organization, close }: PublishOrganizationFormProps) {
  const { t } = useTranslation();
  const { mutate, isPending } = useOrganizationPublishMutation();

  const publish = () =>
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

  return <ConfirmForm icon={RocketIcon} label={t('c:publish')} pending={isPending} onConfirm={publish} onCancel={close} />;
}
