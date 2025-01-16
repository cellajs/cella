import { useTranslation } from 'react-i18next';
import type { OrganizationInvitesInfo } from '~/types/common';

import { useMemo, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<OrganizationInvitesInfo>[] = [
      {
        key: 'userId',
        name: t('common:user'),
        sortable: false,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => row.userId,
        minWidth: 140,
      },
      {
        key: 'expiredAt',
        name: t('common:expires_at'),
        sortable: true,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => dateShort(row.expiredAt),
        minWidth: 80,
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => dateShort(row.createdAt),
        minWidth: 80,
      },
      {
        key: 'createdBy',
        name: t('common:created_by'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => row.createdBy,
        minWidth: 80,
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<OrganizationInvitesInfo>[]>(columns);
};
