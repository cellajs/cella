import { Link, useNavigate } from '@tanstack/react-router';
import { Dot } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { openTaskPreviewSheet } from '~/modules/tasks/helpers';
import { NotSelected } from '~/modules/tasks/task-dropdowns/impact-icons/not-selected';
import { impacts } from '~/modules/tasks/task-dropdowns/select-impact';
import { badgeStyle } from '~/modules/tasks/task-dropdowns/select-labels';
import { type TaskStatus, statusFillColors, statusTextColors, taskStatuses } from '~/modules/tasks/task-dropdowns/select-status';
import { taskTypes } from '~/modules/tasks/task-dropdowns/select-task-type';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { Button } from '~/modules/ui/button';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import { useThemeStore } from '~/store/theme';
import type { Task } from '~/types/app';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');
  const { mode } = useThemeStore();
  const {
    data: { workspace, projects },
  } = useWorkspaceQuery();

  const columns: ColumnOrColumnGroup<Task>[] = [
    CheckboxColumn,
    {
      key: 'summary',
      name: t('app:summary'),
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
            openTaskPreviewSheet(row, mode, navigate, true);
          }}
        >
          <span className="font-light whitespace-pre-wrap leading-5 py-1">
            {row.summary ? (
              <div
                // biome-ignore lint/security/noDangerouslySetInnerHtml: is sanitized by backend
                dangerouslySetInnerHTML={{ __html: row.summary }}
                className="bn-container bn-shadcn"
              />
            ) : (
              '-'
            )}
          </span>
        </Button>
      ),
    },
    {
      key: 'type',
      name: t('app:type'),
      sortable: true,
      visible: !isMobile,
      cellClass: 'start',
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <>
          {taskTypes[taskTypes.findIndex((t) => t.value === row.type)]?.icon()} <span className="ml-2">{t(`app:${row.type}`)}</span>
        </>
      ),
      width: 140,
    },
    {
      key: 'impact',
      name: t('app:impact'),
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
      name: t('app:status'),
      sortable: true,
      visible: !isMobile,
      width: 140,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => {
        const status = taskStatuses[row.status as TaskStatus];
        return (
          <>
            <status.icon className={`size-4 mr-2 fill-current ${statusFillColors[row.status as TaskStatus]}`} aria-hidden="true" />
            <span className={statusTextColors[row.status as TaskStatus]}>{t(`app:${status.status}`)}</span>
          </>
        );
      },
    },
    {
      key: 'assignedTo',
      name: t('app:assigned_to'),
      sortable: false,
      visible: false,
      width: 100,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => {
        if (!row.assignedTo.length) return '-';
        return (
          <AvatarGroup limit={3}>
            <AvatarGroupList>
              {row.assignedTo.map((user) => (
                <AvatarWrap type="user" key={user.id} id={user.id} name={user.name} url={user.thumbnailUrl} className="h-6 w-6 text-xs" />
              ))}
            </AvatarGroupList>
            <AvatarOverflowIndicator className="h-6 w-6 text-xs" />
          </AvatarGroup>
        );
      },
    },
    {
      key: 'labels',
      name: t('app:labels'),
      sortable: false,
      visible: false,
      width: 190,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => {
        if (!row.labels.length) return '-';
        return (
          <div className="flex flex-col">
            {row.labels.map((label) => (
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
      key: 'subtasks',
      name: t('app:todos'),
      sortable: false,
      visible: false,
      width: 80,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) =>
        row.subtasks.length > 0 ? (
          <div className="flex gap-[.07rem]">
            <span className="text-success">{row.subtasks.filter((t) => t.status === 6).length}</span>
            <span className="font-light">/</span>
            <span className="font-light">{row.subtasks.length}</span>
          </div>
        ) : row.subtasks.length ? (
          row.subtasks.length
        ) : (
          '-'
        ),
    },
    {
      key: 'projectId',
      name: t('app:project'),
      sortable: true,
      visible: !isMobile,
      width: 180,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        const project = projects.find((p) => p.id === row.projectId);
        if (!project) return row.projectId;
        return (
          <Link
            to={`/${workspace.organizationId}/workspaces/${workspace.slug}/board?project=${project.slug}`}
            tabIndex={tabIndex}
            disabled={!project.membership?.workspaceId}
            className="flex space-x-2 items-center outline-0 ring-0 group truncate"
          >
            <AvatarWrap type="project" className="h-6 w-6 text-xs" id={project.id} name={project.name} url={project.thumbnailUrl} />
            <span className={`${!project.membership?.workspaceId ? '' : 'group-hover:underline underline-offset-4 truncate'}`}>{project.name}</span>
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
        const user = row.createdBy;
        if (!user) return '-';
        return (
          <Link
            to="/user/$idOrSlug"
            tabIndex={tabIndex}
            params={{ idOrSlug: user.id }}
            className="flex space-x-2 items-center outline-0 ring-0 group truncate w-full"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              openUserPreviewSheet(user, navigate, true);
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
        const user = row.modifiedBy;
        if (!user) return '-';
        return (
          <Link
            to="/user/$idOrSlug"
            tabIndex={tabIndex}
            params={{ idOrSlug: user.id }}
            className="flex space-x-2 items-center outline-0 ring-0 group truncate"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              openUserPreviewSheet(user, navigate, true);
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
