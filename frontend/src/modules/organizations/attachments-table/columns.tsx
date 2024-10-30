import type { Attachment } from '~/types/common';

import type { TFunction } from 'i18next';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (t: TFunction<'translation', undefined>, isMobile: boolean, isAdmin: boolean, isSheet: boolean) => {
  const columns: ColumnOrColumnGroup<Attachment>[] = [
    ...(isAdmin ? [CheckboxColumn] : []),
    {
      key: 'name',
      name: t('common:filename'),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <a href={row.url} tabIndex={tabIndex} className="flex space-x-2 items-center outline-0 ring-0 group">
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.filename || '-'}</span>
        </a>
      ),
    },
    {
      key: 'contentType',
      name: t('common:contentType'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      minWidth: 140,
      renderCell: ({ row, tabIndex }) => {
        return (
          <span tabIndex={tabIndex} className="font-light">
            {row.contentType || '-'}
          </span>
        );
      },
    },
    {
      key: 'size',
      name: t('common:size'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <div className="inline-flex items-center gap-1 relative group h-full w-full">{row.size || '-'}</div>,
      width: 100,
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: true,
      visible: !isSheet && !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.createdAt),
      minWidth: 180,
    },
  ];

  return columns;
};
