import { useTranslation } from 'react-i18next';
import type { Request } from '~/types';

import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<Request>[] = [
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
  ];

  const defaultColumns: ColumnOrColumnGroup<Request>[] = [
    {
      key: 'message',
      name: t('common:message'),
      visible: true,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <>{row.message || '-'}</>,
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.createdAt),
      minWidth: 180,
    },
  ];

  return useState<ColumnOrColumnGroup<Request>[]>(isMobile ? mobileColumns : [...mobileColumns, ...defaultColumns]);
};
