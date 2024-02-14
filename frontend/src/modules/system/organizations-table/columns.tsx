import { useTranslation } from 'react-i18next';
import { Organization } from '~/types';

import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import { AvatarWrap } from '../../common/avatar-wrap';
import { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';
import RowEdit from './row-edit';

export const useColumns = (callback: (organizations: Organization[], action: 'create' | 'update' | 'delete') => void) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<Organization>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('label.name'),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Link
          to="/$organizationIdentifier"
          tabIndex={tabIndex}
          params={{ organizationIdentifier: row.slug }}
          className="flex space-x-2 items-center outline-0 ring-0 group"
        >
          <AvatarWrap type="organization" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name}</span>
        </Link>
      ),
    },
    {
      key: 'edit',
      name: '',
      visible: true,
      width: 32,
      renderCell: ({ row, tabIndex }) => <RowEdit organization={row} tabIndex={tabIndex} callback={callback} />,
    },
  ];

  return useState<ColumnOrColumnGroup<Organization>[]>(
    isMobile
      ? mobileColumns
      : [
          ...mobileColumns,
          {
            key: 'userRole',
            name: t('label.your_role'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => (row.userRole ? t(row.userRole) : ''),
            width: 120,
          },
          {
            key: 'createdAt',
            name: t('label.createdAt'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => dateShort(row.createdAt),
            minWidth: 180,
          },
        ],
  );
};
