import { Link } from '@tanstack/react-router';

import { useTranslation } from 'react-i18next';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import type { Task } from '~/modules/common/electric/electrify';
import { Button } from '~/modules/ui/button';
import CheckboxColumn from '../../common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';
import SelectStatus, { type TaskStatus } from '../task/task-selectors/select-status';
import Expand from './expand';

export type TaskRow = Task & { _type: 'MASTER' | 'DETAIL'; _expanded?: boolean; _parent?: Task };

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<TaskRow>[] = [
    {
      ...CheckboxColumn,
      renderCell: (props) => props.row._type === 'MASTER' && CheckboxColumn.renderCell?.(props),
    },
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      minWidth: 180,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        if (row._type !== 'MASTER') return;

        return (
          <Link
            tabIndex={tabIndex}
            to="/user/$idOrSlug"
            params={{ idOrSlug: row.slug }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
          >
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.summary || '-'}</span>
          </Link>
        );
      },
    },
  ];

  return useState<ColumnOrColumnGroup<TaskRow>[]>(
    isMobile
      ? mobileColumns
      : [
          {
            key: 'expand',
            name: '',
            width: 32,
            visible: true,
            colSpan(args) {
              return args.type === 'ROW' && args.row._type === 'DETAIL' ? 8 : undefined;
            },
            cellClass(row) {
              return row._type === 'DETAIL' ? 'p-2 rdg-expand-cell relative' : undefined;
            },
            renderCell: ({ row, tabIndex, onRowChange }) => {
              if (row._type === 'DETAIL' && row._parent) {
                return <Expand row={row._parent} />;
              }

              return (
                <Button
                  size="icon"
                  tabIndex={tabIndex}
                  variant="cell"
                  className="h-full w-full relative"
                  role="button"
                  onClick={() => onRowChange({ ...row, _expanded: !row._expanded })}
                >
                  <ChevronRight size={16} className={`cursor-pointer transition-transform ${row._expanded ? 'rotate-90' : 'rotate-0'}`} />
                </Button>
              );
            },
          },
          ...mobileColumns,
          {
            key: 'status',
            name: t('common:status'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) =>
              row._type === 'MASTER' && (
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
            renderCell: ({ row }) => row._type === 'MASTER' && row.project_id,
            minWidth: 180,
          },
          {
            key: 'createdAt',
            name: t('common:created_at'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => row._type === 'MASTER' && dateShort(row.created_at),
            minWidth: 180,
          },
        ],
  );
};
