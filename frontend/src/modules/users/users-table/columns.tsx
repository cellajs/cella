import { Link } from '@tanstack/react-router';

import { useTranslation } from 'react-i18next';
import type { User } from '~/types';

import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import { renderSelect } from '~/modules/common/data-table/select-column';
// import { Button } from '~/modules/ui/button';
import { AvatarWrap } from '../../common/avatar-wrap';
import CheckboxColumn from '../../common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';
// import Expand from './expand';
import RowEdit from './row-edit';

export const useColumns = (callback: (users: User[], action: 'create' | 'update' | 'delete') => void) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<User>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      minWidth: 180,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Link tabIndex={tabIndex} to="/user/$idOrSlug" params={{ idOrSlug: row.slug }} className="flex space-x-2 items-center outline-0 ring-0 group">
          <AvatarWrap type="USER" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
        </Link>
      ),
    },
    {
      key: 'edit',
      name: '',
      visible: true,
      width: 32,
      renderCell: ({ row, tabIndex }) => <RowEdit user={row} tabIndex={tabIndex} callback={callback} />,
    },
  ];

  return useState<ColumnOrColumnGroup<User>[]>(
    isMobile
      ? mobileColumns
      : [
          // {
          //   key: 'expand',
          //   name: '',
          //   width: 32,
          //   visible: true,
          //   colSpan(args) {
          //     return args.type === 'ROW' && args.row._type === 'DETAIL' ? 9 : undefined;
          //   },
          //   cellClass(row) {
          //     return row._type === 'DETAIL' ? 'p-2  relative' : undefined;
          //   },
          //   renderCell: ({ row, tabIndex, onRowChange }) => {
          //     if (row._type === 'DETAIL' && row._parent) {
          //       return <Expand row={row._parent} />;
          //     }

          //     return (
          //       <Button
          //         size="icon"
          //         tabIndex={tabIndex}
          //         variant="cell"
          //         className="h-full w-full relative"
          //         role="button"
          //         onClick={() => onRowChange({ ...row, _expanded: !row._expanded })}
          //       >
          //         <ChevronRight size={16} className={`cursor-pointer transition-transform ${row._expanded ? 'rotate-90' : 'rotate-0'}`} />
          //       </Button>
          //     );
          //   },
          // },
          ...mobileColumns,
          {
            key: 'email',
            name: t('common:email'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            minWidth: 140,
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
            key: 'role',
            name: t('common:role'),
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) => t(row.role.toLowerCase()),
            width: 100,
            renderEditCell: renderSelect('role', [
              { label: t('common:admin'), value: 'ADMIN' },
              { label: t('common:user'), value: 'USER' },
            ]),
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
          // {
          //   key: 'membershipCount',
          //   name: t('common:memberships'),
          //   sortable: false,
          //   visible: true,
          //   renderHeaderCell: HeaderCell,
          //   renderCell: ({ row }) =>
          //     row._type === 'MASTER' && (
          //       <>
          //         <UserRoundCheck className="mr-2 opacity-50" size={16} />
          //         {row.counts?.memberships | 0}
          //       </>
          //     ),
          //   width: 140,
          // },
        ],
  );
};
