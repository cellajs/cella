import { renderSelect } from '~/modules/common/data-table/select-column';

import { Link } from '@tanstack/react-router';
import { config } from 'config';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import type { Member } from '~/types/common';
import { dateShort } from '~/utils/date-short';

export const useColumns = (isAdmin: boolean, isSheet: boolean, organizationId: string) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const columns = () => {
    const cols: ColumnOrColumnGroup<Member>[] = [
      // For admins add checkbox column
      ...(isAdmin ? [CheckboxColumn] : []),
      {
        key: 'name',
        name: t('common:name'),
        visible: true,
        sortable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => (
          <Link
            id={`user-cell-${row.id}`}
            to="/user/$idOrSlug"
            tabIndex={tabIndex}
            params={{ idOrSlug: row.slug }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              openUserPreviewSheet(row.id, organizationId);
            }}
          >
            <AvatarWrap type="user" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
          </Link>
        ),
      },
      {
        key: 'email',
        name: t('common:email'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        minWidth: 140,
        renderCell: ({ row, tabIndex }) => {
          return (
            <a href={`mailto:${row.email}`} tabIndex={tabIndex} className="truncate hover:underline underline-offset-4 outline-0 ring-0 font-light">
              {row.email || '-'}
            </a>
          );
        },
      },
      {
        key: 'role',
        name: t('common:role'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <div className="inline-flex items-center gap-1 relative group h-full w-full">{row.membership ? t(row.membership.role) : '-'}</div>
        ),
        width: 100,
        ...(isAdmin && {
          renderEditCell: ({ row, onRowChange }) =>
            renderSelect({
              row,
              onRowChange,
              options: config.rolesByType.entityRoles,
            }),
        }),
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
      {
        key: 'lastSeenAt',
        name: t('common:last_seen_at'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => dateShort(row.lastSeenAt),
        minWidth: 180,
      },
    ];

    return cols;
  };

  return useState<ColumnOrColumnGroup<Member>[]>(columns);
};
