import { useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { appConfig } from 'shared';
import { useOrganizationLayoutContext } from '~/hooks/use-route-context';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { DeleteOrganizations } from '~/modules/organization/delete-organizations';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { UpdateOrganizationDetailsForm } from '~/modules/organization/update-organization-details-form';
import { UpdateOrganizationForm } from '~/modules/organization/update-organization-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

/** Redirects to the settings page under the new slug after a slug-changing update. */
function useSlugChangeCallback(organization: EnrichedOrganization) {
  const navigate = useNavigate();
  const { tenantId } = useOrganizationLayoutContext();

  return (args: CallbackArgs<Organization>) => {
    if (args.status === 'success' && organization.slug !== args.data.slug) {
      navigate({
        to: '/$tenantId/$organizationSlug/organization/settings',
        params: { tenantId, organizationSlug: args.data.slug },
        hash: '',
        replace: true,
      });
    }
  };
}

/** General organization settings card (name, slug, visuals). */
export function OrganizationGeneralCard({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const callback = useSlugChangeCallback(organization);

  return (
    <Card id="update-organization">
      <CardHeader>
        <CardTitle>
          <UnsavedBadge title={t('c:general')} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <UpdateOrganizationForm organization={organization} callback={callback} />
      </CardContent>
    </Card>
  );
}

/** Organization details card (locale, contact, links). */
export function OrganizationDetailsCard({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const callback = useSlugChangeCallback(organization);

  return (
    <Card id="update-organization-details">
      <CardHeader>
        <CardTitle>{t('c:details')}</CardTitle>
      </CardHeader>
      <CardContent>
        <UpdateOrganizationDetailsForm organization={organization} callback={callback} />
      </CardContent>
    </Card>
  );
}

/** Danger-zone card: delete the organization behind a confirm dialog. */
export function OrganizationDeleteCard({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenantId } = useOrganizationLayoutContext();
  const deleteButtonRef = useRef(null);

  const openDeleteDialog = () => {
    useDialoger.getState().create(
      <DeleteOrganizations
        dialog
        tenantId={tenantId}
        organizations={[organization]}
        callback={({ status }: CallbackArgs<Organization[]>) => {
          if (status === 'success') {
            toaster.success(t('c:success.delete_resource', { resource: t('c:organization') }));
            navigate({ to: appConfig.defaultRedirectPath, replace: true });
          }
        }}
      />,
      {
        id: 'delete-organization',
        triggerRef: deleteButtonRef,
        className: 'md:max-w-xl',
        title: t('c:delete_resource', { resource: t('c:organization').toLowerCase() }),
        description: t('c:confirm.delete_resource', {
          name: organization.name,
          resource: t('c:organization').toLowerCase(),
        }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('c:delete_resource', { resource: t('c:organization').toLowerCase() })}</CardTitle>
        <CardDescription>
          <Trans
            t={t}
            i18nKey="c:delete_resource_notice.text"
            values={{ name: organization.name, resource: t('c:organization').toLowerCase() }}
          />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button ref={deleteButtonRef} variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
          <TrashIcon className="mr-2 size-4" />
          <span>{t('c:delete_resource', { resource: t('c:organization').toLowerCase() })}</span>
        </Button>
      </CardContent>
    </Card>
  );
}
