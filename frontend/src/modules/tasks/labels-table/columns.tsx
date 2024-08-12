import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { Label } from '~/types';

export const useColumns = () => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<Label>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: 'Name',
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => t(row.name),
    },
    // {
    //   key: 'count',
    //   sortable: true,
    //   visible: true,
    //   renderHeaderCell: HeaderCell,
    //   name: 'Count',
    //   renderCell: ({ row }) => t(row.count.toString()),
    // },
    // {
    //   key: 'lastAdd',
    //   sortable: true,
    //   visible: true,
    //   renderHeaderCell: HeaderCell,
    //   name: 'Last active',
    //   renderCell: ({ row }) => dateShort(row.lastActive.toString()),
    // },
  ];

  return useState<ColumnOrColumnGroup<Label>[]>(columns);
};
