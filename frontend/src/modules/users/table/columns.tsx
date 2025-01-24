import { useTranslation } from 'react-i18next';
import type { User } from '~/types/common';

import { Link, useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { UserRoundCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { renderSelect } from '~/modules/common/data-table/select-column';
import ImpersonateRow from '~/modules/users/table/impersonate-row';
import UpdateRow from '~/modules/users/table/update-row';
import { dateShort } from '~/utils/date-short';

export const useColumns = (callback: (users: User[]) => void) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');
  const navigate = useNavigate();

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<User>[] = [
      CheckboxColumn,
      {
        key: 'name',
        name: t('common:name'),
        visible: true,
        sortable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => (
          <Link
            id={`user-cell-${row.id}`}
            to="/users/$idOrSlug"
            tabIndex={tabIndex}
            params={{ idOrSlug: row.slug }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              navigate({
                to: '.',
                replace: true,
                resetScroll: false,
                search: (prev) => ({ ...prev, sheetId: row.id }),
              });
            }}
          >
            <AvatarWrap type="user" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
          </Link>
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
        minWidth: 140,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => {
          return (
            <a href={`mailto:${row.email}`} tabIndex={tabIndex} className="truncate hover:underline underline-offset-4 outline-0 ring-0 font-light">
              {row.email || <span className="text-muted">-</span>}
            </a>
          );
        },
      },
      {
        key: 'role',
        name: t('common:role'),
        sortable: true,
        visible: !isMobile,
        width: 100,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <div className="inline-flex items-center gap-1 relative group h-full w-full">{t(`common:${row.role}`)}</div>,
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
        minWidth: 180,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
      },
      {
        key: 'lastSeenAt',
        name: t('common:last_seen_at'),
        sortable: true,
        visible: !isMobile,
        minWidth: 180,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.lastSeenAt ? dateShort(row.lastSeenAt) : <span className="text-muted">-</span>),
      },
      {
        key: 'membershipCount',
        name: 'Memberships',
        sortable: false,
        visible: !isMobile,
        width: 140,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <>
            <UserRoundCheck className="mr-2 opacity-50" size={16} />
            {row.counts?.memberships | 0}
          </>
        ),
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<User>[]>(columns);
};
