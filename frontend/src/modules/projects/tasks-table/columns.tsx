import { Link } from '@tanstack/react-router';

import { useTranslation } from 'react-i18next';

import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import type { Task } from '~/modules/common/electric/electrify';
import CheckboxColumn from '../../common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';
import SelectStatus, { type TaskStatus } from '../task/task-selectors/select-status';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<Task>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      minWidth: 180,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Link tabIndex={tabIndex} to="/user/$idOrSlug" params={{ idOrSlug: row.slug }} className="flex space-x-2 items-center outline-0 ring-0 group">
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.summary || '-'}</span>
        </Link>
      ),
    },
  ];

  return useState<ColumnOrColumnGroup<Task>[]>(
    isMobile
      ? mobileColumns
      : [
          ...mobileColumns,
          {
            key: 'status',
            name: t('common:status'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => (
              <div className="flex gap-2">
                <SelectStatus
                  taskStatus={row.status as TaskStatus}
                  changeTaskStatus={(newStatus) => {
                    console.log(newStatus);
                  }}
                />
              </div>
            ),
            minWidth: 120,
          },
          {
            key: 'project',
            name: t('common:project'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => row.project_id,
            minWidth: 180,
          },
          {
            key: 'createdAt',
            name: t('common:created_at'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => dateShort(row.created_at),
            minWidth: 180,
          },
        ],
  );
};
