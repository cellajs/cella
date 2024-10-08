import { useTranslation } from 'react-i18next';
import type { User } from '~/types/common';

import { Link, useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { ChevronDown, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { renderSelect } from '~/modules/common/data-table/select-column';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import UpdateRow from '~/modules/users/users-table/update-row';
import { dateShort } from '~/utils/date-short';
import ImpersonateRow from './impersonate-row';

export const useColumns = (callback: (users: User[], action: 'create' | 'update' | 'delete') => void) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');
  const columns: ColumnOrColumnGroup<User>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <div className="inline-flex justify-between items-center w-full">
          <Link
            to="/user/$idOrSlug"
            tabIndex={tabIndex}
            params={{ idOrSlug: row.slug }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              openUserPreviewSheet(row, navigate, true);
            }}
          >
            <AvatarWrap type="user" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
          </Link>
        </div>
      ),
    },
    {
      key: 'impersonate',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => <ImpersonateRow user={row} tabIndex={tabIndex} />,
    },
    {
      key: 'edit',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => <UpdateRow user={row} tabIndex={tabIndex} callback={callback} />,
    },
    {
      key: 'email',
      name: t('common:email'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      minWidth: 140,
      renderCell: ({ row, tabIndex }) => {
        return (
          <a href={`mailto:${row.email}`} tabIndex={tabIndex} className="truncate hover:underline underline-offset-4 outline-0 ring-0 font-light">
            {row.email || '-'}
          </a>
        );
      },
    },
    {
      key: 'role',
      name: t('common:role'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <div className="inline-flex items-center gap-1 relative group h-full w-full">
          {t(row.role)}
          <ChevronDown size={16} className="transition-opacity duration-200 opacity-0 group-hover:opacity-100" />
        </div>
      ),
      width: 100,
      renderEditCell: ({ row, onRowChange }) =>
        renderSelect({
          row,
          onRowChange,
          options: config.rolesByType.systemRoles,
        }),
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.createdAt),
      minWidth: 180,
    },
    {
      key: 'lastSeenAt',
      name: t('common:last_seen_at'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.lastSeenAt),
      minWidth: 180,
    },
    {
      key: 'membershipCount',
      name: 'Memberships',
      sortable: false,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <>
          <UserRoundCheck className="mr-2 opacity-50" size={16} />
          {row.counts?.memberships | 0}
        </>
      ),
      width: 140,
    },
  ];
  return useState<ColumnOrColumnGroup<User>[]>(columns);
};
