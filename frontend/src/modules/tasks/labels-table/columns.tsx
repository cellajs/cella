import { Dot, StickyNote } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { Label } from '~/types/app';
import { dateShort } from '~/utils/date-short';
import { badgeStyle } from '../task-selectors/select-labels';

export const useColumns = () => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<Label>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      minWidth: 200,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => t(row.name),
    },
    {
      key: 'color',
      name: t('common:color'),
      visible: true,
      width: 100,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <Dot className="rounded-md" size={22} style={badgeStyle(row.color)} strokeWidth={0} />,
    },
    {
      key: 'useCount',
      name: t('app:tasks'),
      visible: true,
      width: 100,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <>
          <StickyNote className="mr-2 opacity-50" size={16} />
          {row.useCount.toString()}
        </>
      ),
    },
    {
      key: 'lastUsed',
      name: t('app:last_used'),
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.lastUsed.toString()),
    },
  ];

  return useState<ColumnOrColumnGroup<Label>[]>(columns);
};
