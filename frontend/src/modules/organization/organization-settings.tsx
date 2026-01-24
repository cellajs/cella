import { useNavigate, useParams } from '@tanstack/react-router';
import { appConfig } from 'config';
import { TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
// import Subscription from '~/modules/organization/subscription';
import type { Organization } from '~/api.gen';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { PageAside } from '~/modules/common/page/aside';
import StickyBox from '~/modules/common/sticky-box';
import { toaster } from '~/modules/common/toaster/service';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import DeleteOrganizations from '~/modules/organization/delete-organizations';
import UpdateOrganizationDetailsForm from '~/modules/organization/update-organization-details-form';
import UpdateOrganizationForm from '~/modules/organization/update-organization-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

const tabs = [
  { id: 'general', label: 'common:general' },
  { id: 'details', label: 'common:details' },
  // { id: 'subscription', label: 'common:subscription' },
  { id: 'delete-organization', label: 'common:delete_resource', resource: 'common:organization' },
];

function OrganizationSettings({ organization }: { organization: Organization }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { idOrSlug } = useParams({ from: '/appLayout/organization/$idOrSlug/settings' });

  const deleteButtonRef = useRef(null);

  const openDeleteDialog = () => {
    useDialoger.getState().create(
      <DeleteOrganizations
        dialog
        organizations={[organization]}
        callback={({ status }: CallbackArgs<Organization[]>) => {
          if (status === 'success') {
            toaster(t('common:success.delete_resource', { resource: t('common:organization') }), 'success');
            navigate({ to: appConfig.defaultRedirectPath, replace: true });
          }
        }}
      />,
      {
        id: 'delete-organization',
        triggerRef: deleteButtonRef,
        className: 'md:max-w-xl',
        title: t('common:delete_resource', { resource: t('common:organization').toLowerCase() }),
        description: t('common:confirm.delete_resource', {
          name: organization.name,
          resource: t('common:organization').toLowerCase(),
        }),
      },
    );
  };

  const callback = (args: CallbackArgs<Organization>) => {
    if (args.status === 'success' && idOrSlug !== args.data.slug) {
      navigate({
        to: '/organization/$idOrSlug/settings',
        params: { idOrSlug: organization.slug },
        replace: true,
      });
    }
  };

  return (
    <div className="md:flex md:flex-row mx-auto gap-4 my-4 ">
      <div className="max-md:hidden mx-auto md:min-w-48 md:w-[30%] flex h-auto flex-col">
        <StickyBox offsetTop={60} className="md:mt-3 z-10 max-md:block!">
          <PageAside tabs={tabs} className="pb-2" />
        </StickyBox>
      </div>

      <div className="md:w-[70%] flex flex-col gap-8">
        <AsideAnchor id="general" extraOffset>
          <Card id="update-organization">
            <CardHeader>
              <CardTitle>
                <UnsavedBadge title={t('common:general')} />
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
              <CardTitle>{t('common:details')}</CardTitle>
            </CardHeader>
            <CardContent>
              <UpdateOrganizationDetailsForm organization={organization} callback={callback} />
            </CardContent>
          </Card>
        </AsideAnchor>

        {/* <AsideAnchor id="subscription" extraOffset>
          <Card>
            <CardHeader>
              <CardTitle>{t('common:subscription')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Subscription organization={organization} />
            </CardContent>
          </Card>
        </AsideAnchor> */}

        <AsideAnchor id="delete-organization" extraOffset>
          <Card>
            <CardHeader>
              <CardTitle>{t('common:delete_resource', { resource: t('common:organization').toLowerCase() })}</CardTitle>
              <CardDescription>
                <Trans
                  t={t}
                  i18nKey="common:delete_resource_notice.text"
                  values={{ name: organization.name, resource: t('common:organization').toLowerCase() }}
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
                <span>{t('common:delete_resource', { resource: t('common:organization').toLowerCase() })}</span>
              </Button>
            </CardContent>
          </Card>
        </AsideAnchor>
      </div>
    </div>
  );
}

export default OrganizationSettings;
