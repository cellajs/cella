import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { PendingMembership } from '~/modules/memberships/types';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<PendingMembership>[] = [
    {
      key: 'email',
      name: t('c:email'),

      minWidth: 140,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) => {
        if (!row.email) return null;
        return (
          <a
            href={`mailto:${row.email}`}
            tabIndex={tabIndex}
            className="truncate underline-offset-4 outline-0 ring-0 hover:underline"
          >
            {row.email}
          </a>
        );
      },
    },
    {
      key: 'role',
      name: t('c:role'),

      width: 100,
      placeholderValue: '-',
      renderCell: ({ row }) =>
        row.role ? (
          <div className="group relative inline-flex h-full w-full items-center gap-1">{t(row.role)}</div>
        ) : null,
    },
    {
      key: 'createdAt',
      name: t('c:invited_at'),
      sortable: true,
      minBreakpoint: 'md',
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.createdAt),
      minWidth: 120,
    },
    {
      key: 'createdBy',
      name: t('c:invited_by'),

      minBreakpoint: 'md',
      minWidth: 160,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) =>
        row.createdBy && <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />,
    },
  ];

  return useState<ColumnOrColumnGroup<PendingMembership>[]>(columns);
};
