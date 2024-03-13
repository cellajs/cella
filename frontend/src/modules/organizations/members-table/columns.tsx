import { Link } from '@tanstack/react-router';

import { useTranslation } from 'react-i18next';
import type { Member } from '~/types';
import { AvatarWrap } from '../../common/avatar-wrap';

import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import CheckboxColumn from '../../common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';
import { renderSelect } from '../../common/data-table/select-column';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<Member>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Link
          to="/user/$userIdentifier"
          params={{ userIdentifier: row.slug }}
          tabIndex={tabIndex}
          className="flex space-x-2 items-center outline-0 ring-0 group"
        >
          <AvatarWrap type="user" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name}</span>
        </Link>
      ),
    },
    {
      key: 'organizationRole',
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      name: t('common:role'),
      renderCell: ({ row }) => t(row.organizationRole.toLowerCase()),
      renderEditCell: renderSelect('organizationRole', [
        { label: t('common:admin'), value: 'ADMIN' },
        { label: t('common:member'), value: 'MEMBER' },
      ]),
    },
  ];

  return useState<ColumnOrColumnGroup<Member>[]>(
    isMobile
      ? mobileColumns
      : [
          ...mobileColumns,
          {
            key: 'email',
            name: t('common:email'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            minWidth: 180,
            renderCell: ({ row, tabIndex }) => {
              return (
                <a
                  href={`mailto:${row.email}`}
                  tabIndex={tabIndex}
                  className="truncate hover:underline underline-offset-4 outline-0 ring-0 font-light"
                >
                  {row.email || '-'}
                </a>
              );
            },
          },
          {
            key: 'createdAt',
            name: t('common:created_at'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => dateShort(row.createdAt),
            minWidth: 180,
          },
          {
            key: 'lastSeenAt',
            name: t('common:last_seen_at'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => dateShort(row.lastSeenAt),
            minWidth: 180,
          },
        ],
  );
};
