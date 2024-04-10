import { useNavigate, useParams } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

import { useContext } from 'react';
import Sticky from 'react-sticky-el';
import { toast } from 'sonner';
import { AsideNav } from '~/modules/common/aside-nav';
import { OrganizationContext } from '~/modules/organizations/organization';
import { AsideAnchor } from '../common/aside-anchor';
import { dialog } from '../common/dialoger/state';
import DeleteOrganizations from './delete-organizations';
import UpdateOrganizationForm from './update-organization-form';

const tabs = [
  { value: 'general', label: 'common:general', hash: 'general' },
  { value: 'delete-organization', label: 'common:delete_organization', hash: 'delete-organization' },
];

const OrganizationSettings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organization } = useContext(OrganizationContext);
  const { organizationIdentifier }: { organizationIdentifier: string } = useParams({ strict: false });

  const openDeleteDialog = () => {
    dialog(
      <DeleteOrganizations
        dialog
        organizations={[organization]}
        callback={() => {
          toast.success(t('common:success.delete_organization'));
          navigate({ to: '/', replace: true });
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_organization'),
        text: t('common:confirm.delete_organization', { name: organization.name }),
      },
    );
  };

  return (
    <div className="md:flex md:flex-row mx-auto max-w-[1200px] gap-4">
      <div className="mx-auto md:min-w-[200px] md:w-[30%] flex h-auto flex-col">
        <Sticky topOffset={-60} stickyClassName="md:mt-[60px] z-10 max-md:!relative">
          <AsideNav tabs={tabs} className="pb-2" />
        </Sticky>
      </div>

      <div className="md:w-[70%] space-y-6">
        <AsideAnchor id="general">
          <Card>
            <CardHeader>
              <CardTitle>{t('common:general')}</CardTitle>
            </CardHeader>
            <CardContent>
              <UpdateOrganizationForm
                organization={organization}
                callback={(organization) => {
                  if (organizationIdentifier !== organization.slug) {
                    navigate({
                      to: '/$organizationIdentifier/settings',
                      params: { organizationIdentifier: organization.slug },
                      replace: true,
                    });
                  }
                }}
              />
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="delete-organization">
          <Card>
            <CardHeader>
              <CardTitle>{t('common:delete_organization')}</CardTitle>
              <CardDescription>
                <Trans i18nKey="common:delete_organization_notice.text" values={{ name: organization.name }} />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
                <Trash2 className="mr-2 h-4 w-4" />
                <span>{t('common:delete_organization')}</span>
              </Button>
            </CardContent>
          </Card>
        </AsideAnchor>
      </div>
    </div>
  );
};

export default OrganizationSettings;
