import { Link } from '@tanstack/react-router';

import { useTranslation } from 'react-i18next';
import { Member } from '~/types';
import { AvatarWrap } from '../../common/avatar-wrap';

import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import CheckboxColumn from '../../common/data-table/checkbox-column';
import { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<Member>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('label.name'),
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
          <AvatarWrap type="user" className="h-8 w-8" id={row.id} name={row.name} url={`${row.thumbnailUrl}?width=100&format=avif`} />
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name}</span>
        </Link>
      ),
    },
    {
      key: 'organizationRole',
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      name: t('label.role'),
      renderCell: ({ row }) => t(row.organizationRole),
    },
  ];

  return useState<ColumnOrColumnGroup<Member>[]>(
    isMobile
      ? mobileColumns
      : [
          ...mobileColumns,
          {
            key: 'email',
            name: t('label.email'),
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
            name: t('label.createdAt'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => dateShort(row.createdAt),
            minWidth: 180,
          },
          {
            key: 'lastSeenAt',
            name: t('label.lastSeenAt'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => dateShort(row.lastSeenAt),
            minWidth: 180,
          },
        ],
  );
};
