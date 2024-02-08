import { Link } from '@tanstack/react-router';

import { useTranslation } from 'react-i18next';
import { Member } from '~/types';
import { AvatarWrap } from '../avatar-wrap';

import { dateShort } from '~/lib/utils';
import { ColumnOrColumnGroup, SelectColumn } from 'react-data-grid';

export const useColumns = (): ColumnOrColumnGroup<Member>[] => {
  const { t } = useTranslation();

  return [
    SelectColumn,
    {
      key: 'name',
      name: t('label.name', {
        defaultValue: 'Name',
      }),
      minWidth: 200,
      renderCell: ({ row }) => (
        <Link
          to="/user/$userIdentifier"
          params={{
            userIdentifier: row.slug,
          }}
          className="flex space-x-2 items-center group"
        >
          <AvatarWrap type="user" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name}</span>
        </Link>
      ),
    },
    {
      key: 'email',
      name: t('label.email', {
        defaultValue: 'Email',
      }),
      sortable: false,
      minWidth: 180,
      renderCell: ({ row }) => {
        return (
          <a href={`mailto:${row.email}`} className="truncate hover:underline underline-offset-4 font-light">
            {row.email || '-'}
          </a>
        );
      },
    },
    {
      key: 'organizationRole',
      sortable: false,
      name: t('label.role', {
        defaultValue: 'Role',
      }),
      renderCell: ({ row }) => t(row.organizationRole),
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
      key: 'lastSeenAt',
      name: t('label.lastSeenAt', {
        defaultValue: 'Last seen',
      }),
      renderCell: ({ row }) => dateShort(row.lastSeenAt),
      minWidth: 180,
    },
  ];
};
