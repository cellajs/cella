import { useTranslation } from 'react-i18next';
import { Organization } from '~/types';

import { Link } from '@tanstack/react-router';
import { dateShort } from '~/lib/utils';
import { AvatarWrap } from '../avatar-wrap';
import RowActions from './row-actions';
import { ColumnOrColumnGroup } from 'react-data-grid';

export const useColumns = (callback: (organization: Organization, action: 'create' | 'update' | 'delete') => void): ColumnOrColumnGroup<Organization>[] => {
  const { t } = useTranslation();

  return [
    {
      key: 'name',
      name: t('label.name', {
        defaultValue: 'Name',
      }),
      minWidth: 200,
      renderCell: ({ row }) => (
        <Link to="/$organizationIdentifier" params={{ organizationIdentifier: row.slug }} className="flex space-x-2 items-center group">
          <AvatarWrap type="organization" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name}</span>
        </Link>
      ),
    },
    {
      key: 'userRole',
      name: t('label.your_role', {
        defaultValue: 'Your role',
      }),
      sortable: false,
      renderCell: ({ row }) => (row.userRole ? t(row.userRole) : ''),
      width: 100,
    },
    {
      key: 'createdAt',
      name: t('label.createdAt', {
        defaultValue: 'Created',
      }),
      renderCell: ({ row }) => dateShort(row.createdAt),
      minWidth: 180,
    },
    {
      key: 'actions',
      name: t('label.actions', {
        defaultValue: 'Actions',
      }),
      renderCell: ({ row }) => row.userRole === 'ADMIN' && <RowActions organization={row} callback={callback} />,
    },
  ];
};
