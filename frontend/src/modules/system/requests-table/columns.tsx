import { useTranslation } from 'react-i18next';
import type { Request } from '~/types/common';

import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const columns: ColumnOrColumnGroup<Request>[] = [
    CheckboxColumn,
    {
      key: 'requestType',
      name: t('common:request_type'),
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => t(`common:${row.type}`),
      minWidth: 160,
    },
    {
      key: 'email',
      name: t('common:email'),
      visible: true,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <>{row.email || '-'}</>,
    },
    {
      key: 'message',
      name: t('common:message'),
      visible: !isMobile,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <>{row.message || '-'}</>,
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
  ];

  return useState<ColumnOrColumnGroup<Request>[]>(columns);
};
