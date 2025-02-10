import { useTranslation } from 'react-i18next';

import { useMemo, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { InvitedMemberInfo } from '~/modules/memberships/types';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<InvitedMemberInfo>[] = [
      {
        key: 'email',
        name: t('common:email'),
        sortable: true,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => row.email,
        minWidth: 120,
      },
      {
        key: 'role',
        name: t('common:role'),
        sortable: true,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <div className="inline-flex items-center gap-1 relative group h-full w-full">
            {row.role ? t(`common:${row.role}`) : <span className="text-muted">-</span>}
          </div>
        ),
        width: 100,
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
        key: 'expiresAt',
        name: t('common:expires_at'),
        sortable: true,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.expiresAt ? dateShort(row.expiresAt) : <span className="text-muted">-</span>),
        minWidth: 80,
      },
      {
        key: 'createdBy',
        name: t('common:invited_by'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => row.createdBy,
        minWidth: 80,
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<InvitedMemberInfo>[]>(columns);
};
