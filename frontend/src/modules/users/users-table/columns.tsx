import { Link } from '@tanstack/react-router';

import { useTranslation } from 'react-i18next';
import type { User } from '~/types';

import { ChevronRight, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import { renderSelect } from '~/modules/common/data-table/select-column';
import { Button } from '~/modules/ui/button';
import type { UserRow } from '.';
import { AvatarWrap } from '../../common/avatar-wrap';
import CheckboxColumn from '../../common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';
import Expand from './expand';
import RowEdit from './row-edit';

export const useColumns = (callback: (users: User[], action: 'create' | 'update' | 'delete') => void) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<UserRow>[] = [
    {
      ...CheckboxColumn,
      renderCell: (props) => props.row.type === 'MASTER' && CheckboxColumn.renderCell?.(props),
    },
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      minWidth: 180,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        if (row.type !== 'MASTER') return;

        return (
          <Link
            tabIndex={tabIndex}
            to="/user/$idOrSlug"
            params={{ idOrSlug: row.slug }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
          >
            <AvatarWrap type="USER" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
          </Link>
        );
      },
    },
    {
      key: 'edit',
      name: '',
      visible: true,
      width: 32,
      renderCell: ({ row, tabIndex }) => row.type === 'MASTER' && <RowEdit user={row} tabIndex={tabIndex} callback={callback} />,
    },
  ];

  return useState<ColumnOrColumnGroup<UserRow>[]>(
    isMobile
      ? mobileColumns
      : [
          {
            key: 'expand',
            name: '',
            width: 32,
            visible: true,
            colSpan(args) {
              return args.type === 'ROW' && args.row.type === 'DETAIL' ? 8 : undefined;
            },
            cellClass(row) {
              return row.type === 'DETAIL' ? 'p-2 rdg-expand-cell relative' : undefined;
            },
            renderCell: ({ row, tabIndex, onRowChange }) => {
              if (row.type === 'DETAIL' && row.parent) {
                return <Expand row={row.parent} />;
              }

              return (
                <Button
                  size="icon"
                  tabIndex={tabIndex}
                  variant="cell"
                  className="h-full w-full relative"
                  role="button"
                  onClick={() => onRowChange({ ...row, expanded: !row.expanded })}
                >
                  <ChevronRight size={16} className={`cursor-pointer transition-transform ${row.expanded ? 'rotate-90' : 'rotate-0'}`} />
                </Button>
              );
            },
          },
          ...mobileColumns,
          {
            key: 'email',
            name: t('common:email'),
            minWidth: 120,
            sortable: true,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row, tabIndex }) => {
              if (row.type === 'DETAIL') return;

              return (
                <a
                  href={`mailto:${row.email}`}
                  tabIndex={tabIndex}
                  className="truncate hover:underline underline-offset-4 font-light outline-0 ring-0"
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
            renderCell: ({ row }) => row.type === 'MASTER' && t(row.role.toLowerCase()),
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
            renderCell: ({ row }) => row.type === 'MASTER' && dateShort(row.createdAt),
            minWidth: 180,
          },
          {
            key: 'membershipCount',
            name: t('common:memberships'),
            sortable: false,
            visible: true,
            renderHeaderCell: HeaderCell,
            renderCell: ({ row }) =>
              row.type === 'MASTER' && (
                <>
                  <UserRoundCheck className="mr-2 opacity-50" size={16} />
                  {row.counts?.memberships | 0}
                </>
              ),
            width: 140,
          },
        ],
  );
};
