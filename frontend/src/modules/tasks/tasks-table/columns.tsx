import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { Button } from '~/modules/ui/button.tsx';
import { NotSelected } from '~/modules/tasks/task-selectors/impact-icons/not-selected.tsx';
import { impacts } from '~/modules/tasks/task-selectors/select-impact.tsx';
import { type TaskStatus, statusFillColors, statusTextColors, taskStatuses } from '~/modules/tasks/task-selectors/select-status';
import { taskTypes } from '~/modules/tasks/task-selectors/select-task-type.tsx';
import { useWorkspaceStore } from '~/store/workspace.ts';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { dispatchCustomEvent } from '~/lib/custom-events.ts';
import { Dot } from 'lucide-react';
import { badgeStyle } from '../task-selectors/select-labels';
import type { Task } from '~/types';

export const useColumns = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');
  const { projects, workspace } = useWorkspaceStore();

  const setPreviewSearch = (id: string, key: string) => {
    navigate({
      replace: true,
      search: (prev) => ({
        ...prev,
        ...{ [`${key}Preview`]: id },
      }),
    });
  };
  const columns: ColumnOrColumnGroup<Task>[] = [
    CheckboxColumn,
    {
      key: 'summary',
      name: t('common:summary'),
      visible: true,
      minWidth: 280,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Button
          variant="none"
          tabIndex={tabIndex}
          className="inline-flex justify-start h-auto text-left flex-wrap w-full outline-0 ring-0 focus-visible:ring-0 group px-0"
          onClick={() => {
            setPreviewSearch(row.id, 'taskId');
            dispatchCustomEvent('openTaskCardPreview', row.id);
          }}
        >
          <span className="font-light whitespace-pre-wrap leading-5 py-1">
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: we need send it cos blackNote return an html*/}
            {row.summary ? <div dangerouslySetInnerHTML={{ __html: row.summary }} /> : '-'}
          </span>
        </Button>
      ),
    },
    {
      key: 'type',
      name: t('common:type'),
      sortable: true,
      visible: !isMobile,
      cellClass: 'start',
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <>
          {taskTypes[taskTypes.findIndex((t) => t.value === row.type)]?.icon()} <span className="ml-2">{t(`common:${row.type}`)}</span>
        </>
      ),
      width: 140,
    },
    {
      key: 'impact',
      name: t('common:impact'),
      sortable: false,
      visible: !isMobile,
      width: 120,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => {
        if (row.type === 'bug') return '-';

        const impact = row.impact === null ? null : impacts[row.impact];

        return (
          <>
            {impact === null ? (
              <NotSelected className="size-4 mr-2 fill-current" aria-hidden="true" />
            ) : (
              <impact.icon className="size-4 mr-2 fill-current" aria-hidden="true" />
            )}
            {impact && <span>{impact.label}</span>}
          </>
        );
      },
    },
    {
      key: 'status',
      name: t('common:status'),
      sortable: true,
      visible: !isMobile,
      width: 140,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => {
        const status = taskStatuses[row.status as TaskStatus];
        return (
          <>
            <status.icon className={`size-4 mr-2 fill-current ${statusFillColors[row.status as TaskStatus]}`} aria-hidden="true" />
            <span className={statusTextColors[row.status as TaskStatus]}>{t(status.status)}</span>
          </>
        );
      },
    },
    {
      key: 'assignedTo',
      name: t('common:assignedTo'),
      sortable: false,
      visible: false,
      width: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => {
        if (!row.virtualAssignedTo.length) return '-';
        return (
          <div className="flex flex-col">
            {row.virtualAssignedTo.map((user) => (
              <div key={user.id} className="flex items-center gap-1">
                <AvatarWrap type="user" id={user.id} name={user.name} url={user.thumbnailUrl} className="h-6 w-6 text-xs" />
                <span>{user.name}</span>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: 'labels',
      name: t('common:labels'),
      sortable: false,
      visible: false,
      width: 190,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => {
        if (!row.virtualLabels.length) return '-';
        return (
          <div className="flex flex-col">
            {row.virtualLabels.map((label) => (
              <div key={label.id} className="flex items-center gap-1">
                <Dot className="rounded-md" size={16} style={badgeStyle(label.color)} strokeWidth={6} />
                <span>{label.name}</span>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: 'subTasks',
      name: t('common:todos'),
      sortable: false,
      visible: false,
      width: 80,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) =>
        row.subTasks.length > 0 ? (
          <div className="flex gap-[.07rem]">
            <span className="text-success">{row.subTasks.filter((t) => t.status === 6).length}</span>
            <span className="font-light">/</span>
            <span className="font-light">{row.subTasks.length}</span>
          </div>
        ) : row.subTasks.length ? (
          row.subTasks.length
        ) : (
          '-'
        ),
    },
    {
      key: 'projectId',
      name: t('common:project'),
      sortable: true,
      visible: !isMobile,
      width: 180,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        const project = projects.find((p) => p.id === row.projectId);
        if (!project) return row.projectId;
        return (
          <Link
            to={`/workspaces/${workspace.slug}/board?project=${project.slug}`}
            tabIndex={tabIndex}
            disabled={!project.workspaceId}
            className="flex space-x-2 items-center outline-0 ring-0 group truncate"
          >
            <AvatarWrap type="project" className="h-6 w-6 text-xs" id={project.id} name={project.name} url={project.thumbnailUrl} />
            <span className={`${!project.workspaceId ? '' : 'group-hover:underline underline-offset-4 truncate'}`}>{project.name}</span>
          </Link>
        );
      },
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: true,
      visible: !isMobile,
      width: 180,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.createdAt),
    },
    {
      key: 'createdBy',
      name: t('common:created_by'),
      sortable: true,
      visible: !isMobile,
      width: 180,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        const user = row.virtualCreatedBy;
        if (!user) return row.createdBy;
        return (
          <Link
            to="/user/$idOrSlug"
            tabIndex={tabIndex}
            params={{ idOrSlug: user.id }}
            className="flex space-x-2 items-center outline-0 ring-0 group truncate"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              setPreviewSearch(user.id, 'userId');
              openUserPreviewSheet(user);
            }}
          >
            <AvatarWrap type="user" className="h-6 w-6" id={user.id} name={user.name} url={user.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate">{user.name || '-'}</span>
          </Link>
        );
      },
    },
    {
      key: 'modifiedAt',
      name: t('common:updated_at'),
      sortable: true,
      visible: false,
      width: 180,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.modifiedAt),
    },
    {
      key: 'modifiedBy',
      name: t('common:updated_by'),
      sortable: false,
      visible: false,
      width: 180,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        const user = row.virtualUpdatedBy;
        if (!user) return row.modifiedBy;
        return (
          <Link
            to="/user/$idOrSlug"
            tabIndex={tabIndex}
            params={{ idOrSlug: user.id }}
            className="flex space-x-2 items-center outline-0 ring-0 group truncate"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              setPreviewSearch(user.id, 'userId');
              openUserPreviewSheet(user);
            }}
          >
            <AvatarWrap type="user" className="h-6 w-6" id={user.id} name={user.name} url={user.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate">{user.name || '-'}</span>
          </Link>
        );
      },
    },
  ];

  return useState<ColumnOrColumnGroup<Task>[]>(columns);
};
