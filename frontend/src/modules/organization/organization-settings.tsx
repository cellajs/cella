// import { Subscription } from '~/modules/tenants/subscription';

import { useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { appConfig } from 'shared';
import { useOrganizationLayoutContext } from '~/hooks/use-route-context';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { PageAside } from '~/modules/common/page/aside';
import { toaster } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { DeleteOrganizations } from '~/modules/organization/delete-organizations';
import { UpdateOrganizationDetailsForm } from '~/modules/organization/update-organization-details-form';
import { UpdateOrganizationForm } from '~/modules/organization/update-organization-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

const tabs = [
  { id: 'general', label: 'c:general' },
  { id: 'details', label: 'c:details' },
  // { id: 'subscription', label: 'c:subscription' },
  { id: 'delete-organization', label: 'c:delete_resource', resource: 'c:organization' },
];

function OrganizationSettings({ organization }: { organization: Organization }) {
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
            toaster(t('c:success.delete_resource', { resource: t('c:organization') }), 'success');
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

  const callback = (args: CallbackArgs<Organization>) => {
    if (args.status === 'success' && organization.slug !== args.data.slug) {
      navigate({
        to: '/$tenantId/$organizationSlug/organization/settings',
        params: { tenantId, organizationSlug: args.data.slug },
        hash: '',
        replace: true,
      });
    }
  };

  return (
    <div className="container mx-auto my-4 gap-4 md:flex md:flex-row">
      <div className="mx-auto flex h-auto flex-col max-md:hidden md:w-[30%] md:min-w-48">
        <div className="max-md:block! sticky top-15 z-10 md:mt-3">
          <PageAside tabs={tabs} className="pb-2" />
        </div>
      </div>

      <div className="flex flex-col gap-8 md:w-[70%]">
        <AsideAnchor id="general" extraOffset>
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
        </AsideAnchor>

        <AsideAnchor id="details" extraOffset>
          <Card id="update-organization-details">
            <CardHeader>
              <CardTitle>{t('c:details')}</CardTitle>
            </CardHeader>
            <CardContent>
              <UpdateOrganizationDetailsForm organization={organization} callback={callback} />
            </CardContent>
          </Card>
        </AsideAnchor>

        {/* <AsideAnchor id="subscription" extraOffset>
          <Card>
            <CardHeader>
              <CardTitle>{t('c:subscription')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Subscription organization={organization} />
            </CardContent>
          </Card>
        </AsideAnchor> */}

        <AsideAnchor id="delete-organization" extraOffset>
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
              <Button
                ref={deleteButtonRef}
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={openDeleteDialog}
              >
                <TrashIcon className="mr-2 size-4" />
                <span>{t('c:delete_resource', { resource: t('c:organization').toLowerCase() })}</span>
              </Button>
            </CardContent>
          </Card>
        </AsideAnchor>
      </div>
    </div>
  );
}

export default OrganizationSettings;
