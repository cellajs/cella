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
import SelectStatus, { statusVariants, type TaskStatus } from '../task/task-selectors/select-status';
import { toast } from 'sonner';
import { cn } from '~/lib/utils.ts';
import { Button } from '~/modules/ui/button';
import type { Project } from '~/types';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { useQuery } from '@tanstack/react-query';
import { getProject } from '~/api/projects';
import { taskStatuses } from './status';
import { dropDown } from '~/modules/common/dropdowner/state.ts';

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
        <Link
          tabIndex={tabIndex}
          to="/user/$idOrSlug"
          params={{ idOrSlug: row.slug }}
          className="inline-flex flex-wrap w-auto outline-0 ring-0 group"
        >
          <span className="font-light whitespace-pre-wrap leading-5 py-1">{row.summary || '-'}</span>
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
                <Button
                  aria-label="Set status"
                  variant="outlineGhost"
                  size="xs"
                  className={cn(
                    statusVariants({ status: row.status as TaskStatus }),
                    'rounded-none rounded-r -ml-2 [&:not(.absolute)]:active:translate-y-0',
                  )}
                  onClick={(event) => {
                    dropDown(
                      <SelectStatus
                        taskStatus={row.status as TaskStatus}
                        changeTaskStatus={(newStatus) => updateStatus(newStatus as TaskStatus, row.id)}
                        inputPlaceholder={t('common:placeholder.set_status')}
                      />,
                      {
                        id: `select-status-${row.id}`,
                        trigger: event.currentTarget,
                      },
                    );
                  }}
                >
                  <ChevronDown size={12} />
                </Button>
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
            renderCell: ({ row, tabIndex }) => {
              const { data: project } = useQuery<Project>({
                queryKey: ['projects', row.project_id],
                queryFn: () => getProject(row.project_id),
                staleTime: Number.POSITIVE_INFINITY,
              });

              if (!project) return row.project_id;

              if (!project.workspaceId)
                return (
                  <div className="flex space-x-2 cursor-default items-center outline-0 ring-0 group">
                    <AvatarWrap type="PROJECT" className="h-8 w-8" id={project.id} name={project.name} />
                    <span className="truncate font-medium">{project.name || '-'}</span>
                  </div>
                );
              return (
                <Link
                  to="/workspaces/$idOrSlug"
                  tabIndex={tabIndex}
                  // TODO: Fix this
                  params={{ idOrSlug: project.workspaceId || project.id }}
                  className="flex space-x-2 items-center outline-0 ring-0 group"
                >
                  <AvatarWrap type="PROJECT" className="h-8 w-8" id={project.id} name={project.name} />
                  <span className="group-hover:underline underline-offset-4 truncate font-medium">{project.name || '-'}</span>
                </Link>
              );
            },
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
