import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { Project } from '~/types/app';
import { dateShort } from '~/utils/date-short';

export const useColumns = (sheet?: boolean) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const columns: ColumnOrColumnGroup<Project>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        if (!row.membership?.workspaceId)
          return (
            <div className="flex space-x-2 cursor-default items-center outline-0 ring-0 group">
              <AvatarWrap type="project" className="h-8 w-8" id={row.id} name={row.name} />
              <span className="truncate font-medium">{row.name || '-'}</span>
            </div>
          );
        return (
          <Link
            to={`/workspaces/${row.membership.workspaceId}/board?project=${row.slug}`}
            tabIndex={tabIndex}
            className="flex space-x-2 items-center outline-0 ring-0 group"
          >
            <AvatarWrap type="project" className="h-8 w-8" id={row.id} name={row.name} />
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
          </Link>
        );
      },
    },
    {
      key: 'role',
      name: t('common:role'),
      sortable: false,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (row.membership?.role ? t(row.membership.role) : '-'),
      width: 120,
    },
    ...(!sheet
      ? [
          {
            key: 'createdAt',
            name: t('common:created_at'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }: { row: Project }) => dateShort(row.createdAt),
          },
        ]
      : []),
  ];

  return useState<ColumnOrColumnGroup<Project>[]>(columns);
};
