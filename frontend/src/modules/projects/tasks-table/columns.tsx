import { Link } from '@tanstack/react-router';

import { useTranslation } from 'react-i18next';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import { useElectric, type Task } from '~/modules/common/electric/electrify';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import SelectStatus, { statusVariants, taskStatuses, type TaskStatus } from '../task/task-selectors/select-status';
import { toast } from 'sonner';
import { cn } from '~/lib/utils.ts';
import { Button } from '~/modules/ui/button';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');
  const Electric = useElectric();
  const updateStatus = (value: TaskStatus, taskId: string) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    const db = Electric.db;

    db.tasks.update({
      data: {
        status: value,
      },
      where: {
        id: taskId,
      },
    });
    toast.success(t('common:success.new_status', { status: t(taskStatuses[value].status).toLowerCase() }));
  };

  const mobileColumns: ColumnOrColumnGroup<Task>[] = [
    CheckboxColumn,
    {
      key: 'summary',
      name: t('common:summary'),
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
                  changeTaskStatus={(newStatus) => updateStatus(newStatus as TaskStatus, row.id)}
                  nextButton={
                    <Button
                      variant="outlineGhost"
                      size="xs"
                      className={cn(
                        'border-r-0 rounded-r-none font-normal [&:not(.absolute)]:active:translate-y-0 disabled:opacity-100',
                        statusVariants({ status: row.status as TaskStatus }),
                      )}
                      onClick={() => updateStatus((row.status + 1) as TaskStatus, row.id)}
                      disabled={(row.status as TaskStatus) === 6}
                    >
                      {t(taskStatuses[row.status as TaskStatus].action)}
                    </Button>
                  }
                  inputPlaceholder={t('common:placeholder.set_status')}
                  trigger={
                    <Button
                      aria-label="Set status"
                      variant="outlineGhost"
                      size="xs"
                      className={cn(
                        statusVariants({ status: row.status as TaskStatus }),
                        'rounded-none rounded-r -ml-2 [&:not(.absolute)]:active:translate-y-0',
                      )}
                    >
                      <ChevronDown size={12} />
                    </Button>
                  }
                />
              </div>
            ),
            minWidth: 120,
          },
          {
            key: 'project_id',
            name: t('common:project'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => row.project_id,
            minWidth: 180,
          },
          {
            key: 'created_at',
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
