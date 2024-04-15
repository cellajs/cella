import { useTranslation } from 'react-i18next';
import type { Organization } from '~/types';

import { Link } from '@tanstack/react-router';
import { Shield, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import { AvatarWrap } from '../../common/avatar-wrap';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';
import { renderSelect } from '../../common/data-table/select-column';
import RowEdit from './row-edit';

export const useColumns = (callback: (organizations: Organization[], action: 'create' | 'update' | 'delete') => void) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<Organization>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Link
          to="/$organizationIdentifier/members"
          tabIndex={tabIndex}
          params={{ organizationIdentifier: row.slug }}
          className="flex space-x-2 items-center outline-0 ring-0 group"
        >
          <AvatarWrap type="organization" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
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
            name: t('common:your_role'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => (row.userRole ? t(row.userRole.toLowerCase()) : '-'),
            width: 120,
            renderEditCell: renderSelect('userRole', [
              { label: t('common:admin'), value: 'ADMIN' },
              { label: t('common:member'), value: 'MEMBER' },
            ]),
          },
          {
            key: 'subscription',
            name: t('common:subscription'),
            sortable: false,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: () => '-',
            minWidth: 140,
          },
          {
            key: 'createdAt',
            name: t('common:created_at'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => dateShort(row.createdAt),
            minWidth: 180,
          },
          {
            key: 'memberCount',
            name: t('common:members'),
            sortable: false,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => (
              <>
                <UserRound className="mr-2 opacity-50" size={16} />
                {row.counts?.members || 0}
              </>
            ),
            width: 140,
          },
          {
            key: 'adminCount',
            name: t('common:admins'),
            sortable: false,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => (
              <>
                <Shield className="mr-2 opacity-50" size={16} />
                {row.counts?.admins || 0}
              </>
            ),
            width: 140,
          },
        ],
  );
};
