import { useNavigate, useParams } from '@tanstack/react-router';
import { config } from 'config';
import { Trash } from 'lucide-react';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { PageAside } from '~/modules/common/page/page-aside';
import StickyBox from '~/modules/common/sticky-box';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import DeleteOrganizations from '~/modules/organizations/delete-organizations';
// import Subscription from '~/modules/organizations/subscription';
import type { Organization } from '~/modules/organizations/types';
import UpdateOrganizationForm from '~/modules/organizations/update-organization-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { OrganizationSettingsRoute } from '~/routes/organizations';

const tabs = [
  { id: 'general', label: 'common:general' },
  // { id: 'subscription', label: 'common:subscription' },
  { id: 'delete-organization', label: 'common:delete_resource', resource: 'common:organization' },
];

const OrganizationSettings = ({ organization }: { organization: Organization }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { idOrSlug } = useParams({ from: OrganizationSettingsRoute.id });

  const deleteButtonRef = useRef(null);

  const openDeleteDialog = () => {
    useDialoger.getState().create(
      <DeleteOrganizations
        dialog
        organizations={[organization]}
        callback={() => {
          toast.success(t('common:success.delete_resource', { resource: t('common:organization') }));
          navigate({ to: config.defaultRedirectPath, replace: true });
        }}
      />,
      {
        id: 'delete-organization',
        triggerRef: deleteButtonRef,
        className: 'md:max-w-xl',
        title: t('common:delete_resource', { resource: t('common:organization').toLowerCase() }),
        description: t('common:confirm.delete_resource', { name: organization.name, resource: t('common:organization').toLowerCase() }),
      },
    );
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
              <UpdateOrganizationForm
                organization={organization}
                callback={(organization) => {
                  if (idOrSlug !== organization.slug) {
                    navigate({
                      to: '/organizations/$idOrSlug/settings',
                      params: { idOrSlug: organization.slug },
                      replace: true,
                    });
                  }
                }}
              />
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
                  i18nKey="common:delete_resource_notice.text"
                  values={{ name: organization.name, resource: t('common:organization').toLowerCase() }}
                />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button ref={deleteButtonRef} variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
                <Trash className="mr-2 h-4 w-4" />
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
