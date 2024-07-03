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
import { dropdowner } from '~/modules/common/dropdowner/state.ts';
import { taskTypes } from '../task/task-selectors/select-task-type.tsx';
import { impacts } from '../task/task-selectors/select-impact.tsx';
import { NotSelected } from '../task/task-selectors/impact-icons/not-selected.tsx';
import { sheet } from '~/modules/common/sheeter/state.ts';
import { TaskCard } from '../task/task-card.tsx';

const openTaskCardSheet = (row: Task) => {
  //TODO rework
  sheet(
    <TaskCard
      key={row.id}
      task={{ ...row, virtualAssignedTo: [], virtualLabels: [], subTasks: [] }}
      isExpanded={false}
      isSelected={false}
      isFocused={true}
      handleTaskChange={() => {}}
      handleTaskSelect={() => {}}
      handleTaskActionClick={() => {}}
      setIsExpanded={() => {}}
    />,
    {
      className: 'max-w-full lg:max-w-4xl p-0',
      id: 'task-card-preview',
    },
  );
};

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
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            openTaskCardSheet(row);
          }}
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
            key: 'impact',
            name: t('common:impact'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => {
              const impact = row.impact !== null ? impacts[row.impact] : null;
              return (
                <>
                  {impact === null ? (
                    <NotSelected className="size-4 fy" aria-hidden="true" title="Set impact" />
                  ) : (
                    <impact.icon className="size-4" aria-hidden="true" title="Set impact" />
                  )}
                </>
              );
            },
            minWidth: 60,
          },
          {
            key: 'type',
            name: t('common:type'),
            sortable: true,
            visible: true,
            cellClass: 'start',
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => (
              <>
                {taskTypes[taskTypes.findIndex((t) => t.value === row.type)].icon()}{' '}
                <span className="ml-2 font-light">{t(`common:${row.type}`)}</span>
              </>
            ),
            minWidth: 100,
          },
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
                    dropdowner(
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
            minWidth: 140,
          },
          {
            key: 'subTasks',
            name: t('common:todos'),
            sortable: false,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) =>
              row.subTasks.length > 0 ? (
                <div className="inline-flex py-0 h-5 ml-1 gap-[.07rem]">
                  <span className="text-success">{row.subTasks.filter((t) => t.status === 6).length}</span>
                  <span className="font-light">/</span>
                  <span className="font-light">{row.subTasks.length}</span>
                </div>
              ) : (
                row.subTasks.length
              ),
            width: 120,
          },
          {
            key: 'created_by',
            name: t('common:created_by'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => row.created_by,
            minWidth: 180,
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
            minWidth: 140,
          },
          {
            key: 'modified_at',
            name: t('common:updated_at'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => dateShort(row.modified_at),
            minWidth: 140,
          },
        ],
  );
};
