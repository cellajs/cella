import { useNavigate, useParams } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';

import { useContext } from 'react';
import { toast } from 'sonner';
import { OrganizationContext } from '~/modules/organizations/organization';
import { dialog } from '../common/dialoger/state';
import DeleteOrganizations from './delete-organizations';
import UpdateOrganizationForm from './update-organization-form';

const OrganizationSettings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organization } = useContext(OrganizationContext);
  const { organizationIdentifier }: { organizationIdentifier: string } = useParams({ strict: false });

  return (
    <Card className="sm:w-[600px] mx-auto">
      <CardContent className="pt-6">
        <UpdateOrganizationForm
          organization={organization}
          callback={(organization) => {
            if (organizationIdentifier !== organization.slug) {
              navigate({
                to: '/$organizationIdentifier/$tab',
                params: {
                  organizationIdentifier: organization.slug,
                  tab: 'settings',
                },
                replace: true,
              });
            }
          }}
        />

        <hr className="my-6" />

        <p className="font-light mb-4 text-sm">
          As an admin you can permanently delete the organization <strong>{organization.name}</strong>. All members will loose access to this
          organization and its data. Please note that this action is irreversible.
        </p>

        <Button
          aria-label="Delete"
          variant="destructive"
          onClick={() => {
            dialog(
              <DeleteOrganizations
                dialog
                organizations={[organization]}
                callback={() => {
                  toast.success(t('success.delete_organization'));
                  navigate({
                    to: '/',
                    replace: true,
                  });
                }}
              />,
              {
                className: 'sm:max-w-xl',
                title: t('label.delete_organization'),
                description: t('description.delete_organization'),
              },
            );
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          <span>{t('action.delete_organization')}</span>
        </Button>
      </CardContent>
    </Card>
  );
};

export default OrganizationSettings;
