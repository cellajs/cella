import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { PendingMembership } from '~/modules/memberships/types';
import { UserCellById } from '~/modules/user/user-cell';
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
        renderCell: ({ row, tabIndex }) => {
          if (!row.email) return <span className="text-muted">-</span>;
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
        renderCell: ({ row }) => (
          <div className="inline-flex items-center gap-1 relative group h-full w-full">
            {row.role ? t(row.role, { ns: ['app', 'common'] }) : <span className="text-muted">-</span>}
          </div>
        ),
      },
      {
        key: 'createdAt',
        name: t('common:invited_at'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
        minWidth: 80,
      },
      {
        key: 'createdBy',
        name: t('common:invited_by'),
        sortable: false,
        visible: !isMobile,
        minWidth: 80,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => (
          <UserCellById userId={row.createdBy} cacheOnly={false} tabIndex={tabIndex} />
        ),
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<PendingMembership>[]>(columns);
};
