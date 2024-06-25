import { Link } from '@tanstack/react-router';
import { Shield, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { Project } from '~/types';
import { AvatarWrap } from '../../common/avatar-wrap';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<Project>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        return (
          <Link
            to="/workspaces/$idOrSlug"
            tabIndex={tabIndex}
            // TODO: Fix this
            params={{ idOrSlug: row.workspaceId || row.id }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
          >
            <AvatarWrap type="PROJECT" className="h-8 w-8" id={row.id} name={row.name} />
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
          </Link>
        );
      },
    },
  ];

  return useState<ColumnOrColumnGroup<Project>[]>(
    isMobile
      ? mobileColumns
      : [
          ...mobileColumns,
          {
            key: 'role',
            name: t('common:role'),
            sortable: false,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => (row.membership?.role ? t(row.membership.role.toLowerCase()) : '-'),
            width: 120,
          },
          {
            key: 'createdAt',
            name: t('common:created_at'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => dateShort(row.createdAt),
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
                {row.counts.memberships.members}
              </>
            ),
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
                {row.counts.memberships.admins}
              </>
            ),
          },
        ],
  );
};
