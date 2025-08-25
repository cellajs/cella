import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useEntitySummary } from '~/hooks/use-entity-summary';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { PendingInvitation } from '~/modules/memberships/types';
import UserCell from '~/modules/users/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<PendingInvitation>[] = [
      {
        key: 'email',
        name: t('common:email'),
        sortable: true,
        visible: true,
        renderHeaderCell: HeaderCell,
        minWidth: 140,
        renderCell: ({ row, tabIndex }) => {
          if (!row.email) return <span className="text-muted">-</span>;
          return (
            <a href={`mailto:${row.email}`} tabIndex={tabIndex} className="truncate hover:underline underline-offset-4 outline-0 ring-0 font-light">
              {row.email}
            </a>
          );
        },
      },
      {
        key: 'role',
        name: t('common:role'),
        sortable: true,
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
        key: 'expiresAt',
        name: t('common:expires_at'),
        sortable: true,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.expiresAt ? dateShort(row.expiresAt) : <span className="text-muted">-</span>),
        minWidth: 80,
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
        sortable: true,
        visible: !isMobile,
        minWidth: 80,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => {
          if (!row.createdBy) return <span className="text-muted">-</span>;

          const user = useEntitySummary({ idOrSlug: row.createdBy, entityType: 'user', cacheOnly: true });
          if (!user) return <span>{row.createdBy}</span>;

          return <UserCell user={user} tabIndex={tabIndex} />;
        },
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<PendingInvitation>[]>(columns);
};
