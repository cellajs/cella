import { useNavigate, useParams } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';

import { useContext } from 'react';
import { OrganizationContext } from '~/pages/organization';
import DeleteOrganization from './delete-organization-form';
import { dialog } from './dialoger/state';
import UpdateOrganizationForm from './update-organization-form';

const OrganizationSettings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organization } = useContext(OrganizationContext);
  const { organizationIdentifier } = useParams({ strict: false });

  return (
    <Card className="sm:w-[500px] mx-auto">
      <CardContent className="pt-6">
        <UpdateOrganizationForm
          organization={organization}
          callback={(organization) => {
            if (organizationIdentifier !== organization.slug) {
              navigate({
                to: '/$organizationIdentifier/settings',
                params: {
                  organizationIdentifier: organization.slug,
                },
                replace: true,
              });
            }
          }}
        />
      </CardContent>
      <CardFooter className="flex">
        <Button
          aria-label="Delete"
          variant="destructive"
          onClick={() => {
            dialog(
              <DeleteOrganization
                organization={organization}
                callback={() => {
                  navigate({
                    to: '/',
                    replace: true,
                  });
                }}
              />,
              {
                className: 'sm:max-w-xl',
                title: t('label.delete_organization', {
                  defaultValue: 'Delete organization',
                }),
              },
            );
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          <span>
            {t('action.delete_organization', {
              defaultValue: 'Delete organization',
            })}
          </span>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default OrganizationSettings;
