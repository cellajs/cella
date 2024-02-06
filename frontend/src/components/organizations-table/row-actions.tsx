import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Organization } from '~/types';

import { Button } from '~/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';

import DeleteOrganization from '../../modules/organizations/delete-organization';
import { dialog } from '../dialoger/state';
import UpdateOrganizationForm from '../update-organization-form';

interface Props {
  organization: Organization;
  callback: (organization: Organization, action: 'create' | 'update' | 'delete') => void;
}

const DataTableRowActions = ({ organization, callback }: Props) => {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="data-[state=open]:bg-muted flex h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuItem asChild>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => {
              dialog(<UpdateOrganizationForm organization={organization} dialog callback={(organization) => callback(organization, 'update')} />, {
                drawerOnMobile: false,
                className: 'sm:max-w-xl',
              });
            }}
          >
            {t('action.edit', {
              defaultValue: 'Edit',
            })}
          </Button>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => {
              dialog(<DeleteOrganization organization={organization} dialog callback={(organization) => callback(organization, 'delete')} />, {
                className: 'sm:max-w-xl',
                title: t('label.delete_organization', {
                  defaultValue: 'Delete organization',
                }),
                description: t('description.delete_organization', {
                  defaultValue: 'Are you sure you want to delete this organization?',
                }),
              });
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>
              {t('action.delete', {
                defaultValue: 'Delete',
              })}
            </span>
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default DataTableRowActions;
