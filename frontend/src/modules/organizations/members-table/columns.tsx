import type { Member } from '~/types/common';

import { Link } from '@tanstack/react-router';
import { config } from 'config';
import type { TFunction } from 'i18next';
import { ChevronDown } from 'lucide-react';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { renderSelect } from '~/modules/common/data-table/select-column';
import { dateShort } from '~/utils/date-short';

export const useColumns = (
  t: TFunction<'translation', undefined>,
  openUserPreview: (user: Member) => void,
  isMobile: boolean,
  isAdmin: boolean,
  isSheet: boolean,
) => {
  const columns: ColumnOrColumnGroup<Member>[] = [
    ...(isAdmin ? [CheckboxColumn] : []),
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Link
          to="/user/$idOrSlug"
          tabIndex={tabIndex}
          params={{ idOrSlug: row.slug }}
          className="flex space-x-2 items-center outline-0 ring-0 group"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            openUserPreview(row);
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
        <div className="inline-flex items-center gap-1 relative group h-full w-full">
          {row.membership ? t(row.membership.role) : '-'}
          <ChevronDown size={16} className="transition-opacity duration-200 opacity-0 group-hover:opacity-100" />
        </div>
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

  return columns;
};
