import { useTranslation } from 'react-i18next';
import { Organization } from '~/types';

import { Link } from '@tanstack/react-router';
import { dateShort } from '~/lib/utils';
import { AvatarWrap } from '../avatar-wrap';
import RowActions from './row-actions';
import HeaderCell from '../data-table/header-cell';
import { useState } from 'react';
import { ColumnOrColumnGroup } from '../data-table/columns-view';
import { useBreakpoints } from '~/hooks/use-breakpoints';

export const useColumns = (callback: (organization: Organization, action: 'create' | 'update' | 'delete') => void) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<Organization>[] = [
    {
      key: 'name',
      name: t('label.name', {
        defaultValue: 'Name',
      }),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <Link
          to="/$organizationIdentifier"
          params={{
            organizationIdentifier: row.slug,
          }}
          className="flex space-x-2 items-center group"
        >
          <AvatarWrap type="organization" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name}</span>
        </Link>
      ),
    },
    {
      key: 'actions',
      name: t('label.actions', {
        defaultValue: 'Actions',
      }),
      visible: true,
      width: 100,
      renderCell: ({ row }) => <RowActions organization={row} callback={callback} />,
    },
  ];

  return useState<ColumnOrColumnGroup<Organization>[]>(
    isMobile ? mobileColumns :
      [
        ...mobileColumns,
        {
          key: 'userRole',
          name: t('label.your_role', {
            defaultValue: 'Your role',
          }),
          sortable: true,
          visible: true,
          renderHeaderCell: HeaderCell,
          renderCell: ({ row }) => (row.userRole ? t(row.userRole) : ''),
          width: 100,
        },
        {
          key: 'createdAt',
          name: t('label.createdAt', {
            defaultValue: 'Created',
          }),
          sortable: true,
          visible: true,
          renderHeaderCell: HeaderCell,
          renderCell: ({ row }) => dateShort(row.createdAt),
          minWidth: 180,
        },
      ]);
};
