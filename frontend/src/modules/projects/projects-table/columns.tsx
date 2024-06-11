import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Shield, UserRound } from 'lucide-react';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import { AvatarWrap } from '../../common/avatar-wrap';
import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';
import type { ProjectRow } from '~/types';
import { renderSelect } from '../../common/data-table/select-column';
import { config } from 'config';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<ProjectRow>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Link to="/" tabIndex={tabIndex} params={{ idOrSlug: row.organizationId }} className="flex space-x-2 items-center outline-0 ring-0 group">
          <AvatarWrap type="ORGANIZATION" className="h-8 w-8" id={row.id} name={row.name} />
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
        </Link>
      ),
    },
  ];

  return useState<ColumnOrColumnGroup<ProjectRow>[]>(
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
            renderCell: ({ row }) => (row.role ? t(row.role.toLowerCase()) : '-'),
            width: 120,
            renderEditCell: (props) =>
              renderSelect({
                props,
                key: 'userRole',
                options: config.rolesByType.entityRoles,
              }),
          },
          {
            key: 'subscription',
            name: t('common:subscription'),
            sortable: false,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: () => '-',
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
                {row.counts?.members || 0}
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
                {row.counts?.admins || 0}
              </>
            ),
          },
        ],
  );
};
