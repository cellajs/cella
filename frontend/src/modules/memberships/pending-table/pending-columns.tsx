import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { HeaderCell } from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { PendingMembership } from '~/modules/memberships/types';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<PendingMembership>[] = [
      {
        key: 'email',
        name: t('common:email'),
        sortable: false,
        visible: true,
        renderHeaderCell: HeaderCell,
        minWidth: 140,
        placeholderValue: '-',
        renderCell: ({ row, tabIndex }) => {
          if (!row.email) return null;
          return (
            <a
              href={`mailto:${row.email}`}
              tabIndex={tabIndex}
              className="truncate hover:underline underline-offset-4 outline-0 ring-0 font-light"
            >
              {row.email}
            </a>
          );
        },
      },
      {
        key: 'role',
        name: t('common:role'),
        sortable: false,
        visible: true,
        width: 100,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row }) =>
          row.role ? (
            <div className="inline-flex items-center gap-1 relative group h-full w-full">
              {t(row.role, { ns: ['app', 'common'] })}
            </div>
          ) : null,
      },
      {
        key: 'createdAt',
        name: t('common:invited_at'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.createdAt),
        minWidth: 80,
      },
      {
        key: 'createdBy',
        name: t('common:invited_by'),
        sortable: false,
        visible: !isMobile,
        minWidth: 80,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row, tabIndex }) =>
          row.createdBy && <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />,
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<PendingMembership>[]>(columns);
};
