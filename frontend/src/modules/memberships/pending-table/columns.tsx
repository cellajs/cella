import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { InvitedMember } from '~/modules/memberships/types';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<InvitedMember>[] = [
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
            {row.role ? t(`common:${row.role}`) : <span className="text-muted">-</span>}
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
        renderCell: ({ row, tabIndex }) =>
          row.createdBy ? (
            <Link
              id={`pending-created-by-${row.createdBy}-cell-${row.id}`}
              to="/users/$idOrSlug"
              tabIndex={tabIndex}
              params={{ idOrSlug: row.createdBy }}
              className="flex space-x-2 items-center outline-0 ring-0 group"
            >
              <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.createdBy}</span>
            </Link>
          ) : (
            <span className="text-muted">-</span>
          ),
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<InvitedMember>[]>(columns);
};
