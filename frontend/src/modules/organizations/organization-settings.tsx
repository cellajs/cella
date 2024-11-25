import { useNavigate, useParams } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

import { config } from 'config';
import { toast } from 'sonner';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { dialog } from '~/modules/common/dialoger/state';
import { PageAside } from '~/modules/common/page-aside';
import StickyBox from '~/modules/common/sticky-box';
import DeleteOrganizations from '~/modules/organizations/delete-organizations';
import Subscription from '~/modules/organizations/subscription';
import UpdateOrganizationForm from '~/modules/organizations/update-organization-form';
import { OrganizationSettingsRoute } from '~/routes/organizations';
import type { Organization } from '~/types/common';

const tabs = [
  { id: 'general', label: 'common:general' },
  { id: 'subscription', label: 'common:subscription' },
  { id: 'delete-organization', label: 'common:delete_resource', resource: 'common:organization' },
];

const OrganizationSettings = ({ organization }: { organization: Organization }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { idOrSlug } = useParams({ from: OrganizationSettingsRoute.id });

  const openDeleteDialog = () => {
    dialog(
      <DeleteOrganizations
        dialog
        organizations={[organization]}
        callback={() => {
          toast.success(t('common:success.delete_resource', { resource: t('common:organization') }));
          navigate({ to: config.defaultRedirectPath, replace: true });
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_resource', { resource: t('common:organization').toLowerCase() }),
        description: t('common:confirm.delete_resource', { name: organization.name, resource: t('common:organization').toLowerCase() }),
      },
    );
  };

  return (
    <div className="md:flex md:flex-row mx-auto gap-4 my-4">
      <div className="max-md:hidden mx-auto md:min-w-48 md:w-[30%] flex h-auto flex-col">
        <StickyBox offsetTop={60} className="md:mt-2 z-10 max-md:!block">
          <PageAside tabs={tabs} className="pb-2" />
        </StickyBox>
      </div>

      <div className="md:w-[70%] flex flex-col gap-8">
        <AsideAnchor id="general">
          <Card>
            <CardHeader>
              <CardTitle>{t('common:general')}</CardTitle>
            </CardHeader>
            <CardContent>
              <UpdateOrganizationForm
                organization={organization}
                callback={(organization) => {
                  if (idOrSlug !== organization.slug) {
                    navigate({
                      to: '/$idOrSlug/settings',
                      params: { idOrSlug: organization.slug },
                      replace: true,
                    });
                  }
                }}
              />
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="subscription">
          <Card>
            <CardHeader>
              <CardTitle>{t('common:subscription')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Subscription organization={organization} />
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="delete-organization">
          <Card>
            <CardHeader>
              <CardTitle>{t('common:delete_resource', { resource: t('common:organization').toLowerCase() })}</CardTitle>
              <CardDescription>
                <Trans
                  i18nKey="common:delete_resource_notice.text"
                  values={{ name: organization.name, resource: t('common:organization').toLowerCase() }}
                />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
                <Trash2 className="mr-2 h-4 w-4" />
                <span>{t('common:delete_resource', { resource: t('common:organization').toLowerCase() })}</span>
              </Button>
            </CardContent>
          </Card>
        </AsideAnchor>
      </div>
    </div>
  );
};

export default OrganizationSettings;
