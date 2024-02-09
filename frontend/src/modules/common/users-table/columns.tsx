import { Link } from '@tanstack/react-router';

import { useTranslation } from 'react-i18next';
import { User } from '~/types';

import { SelectColumn } from 'react-data-grid';
import { dateShort } from "~/lib/utils";
import RowActions from './row-actions';
import { AvatarWrap } from '../avatar-wrap';
import { UserRow } from '.';
import { Button } from '~/modules/ui/button';
import { ChevronRight } from 'lucide-react';
import Expand from './expand';
import HeaderCell from '../data-table/header-cell';
import { useState } from 'react';
import { ColumnOrColumnGroup } from '../data-table/columns-view';

export const useColumns = (callback: (user: User, action: 'create' | 'update' | 'delete') => void) => {
  const { t } = useTranslation();

  return useState<ColumnOrColumnGroup<UserRow>[]>([
    {
      key: 'expand',
      name: '',
      width: 32,
      visible: true,
      colSpan(args) {
        return args.type === 'ROW' && args.row.type === 'DETAIL' ? 8 : undefined;
      },
      cellClass(row) {
        return row.type === 'DETAIL'
          ? 'p-2 relative'
          : undefined;
      },
      renderCell: ({ row, onRowChange }) => {
        if (row.type === 'DETAIL') {
          return <Expand row={row.parent} />;
        }

        return (
          <Button size="icon" variant="ghost" className="h-8 w-8 group -ml-2 relative -mr-2" role="button" onClick={() => onRowChange({ ...row, expanded: !row.expanded })}>
            <ChevronRight
              size={16}
              className={`cursor-pointer opacity-50 transition-transform group-hover:opacity-75 ${row.expanded ? 'rotate-90' : 'rotate-0'}`}
            />
          </Button>
        );
      },
    },
    {
      ...SelectColumn,
      renderCell: (props) => props.row.type === 'MASTER' && SelectColumn.renderCell?.(props),
    },
    {
      key: 'name',
      name: t('label.name', {
        defaultValue: 'Name',
      }),
      visible: true,
      minWidth: 200,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => row.type === 'MASTER' && (
        <Link
          to="/user/$userIdentifier"
          params={{
            userIdentifier: row.slug,
          }}
          className="flex space-x-2 items-center group"
        >
          <AvatarWrap type="user" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
          <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name}</span>
        </Link>
      ),
    },
    {
      key: 'actions',
      name: t('label.actions', {
        defaultValue: 'Actions',
      }),
      visible: true,
      width: 32,
      renderCell: ({ row }) => row.type === 'MASTER' && <RowActions user={row} callback={callback} />,
    },
    {
      key: 'email',
      name: t('label.email', {
        defaultValue: 'Email',
      }),
      minWidth: 180,
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => row.type === 'MASTER' && (
        <a href={`mailto:${row.email}`} className="truncate hover:underline underline-offset-4 font-light">
          {row.email || '-'}
        </a>
      ),
    },
    {
      key: 'role',
      name: t('label.role', {
        defaultValue: 'Role',
      }),
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => row.type === 'MASTER' && t(row.role),
      width: 100,
    },
    {
      key: 'createdAt',
      name: t('label.createdAt', {
        defaultValue: 'Created',
      }),
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => row.type === 'MASTER' && dateShort(row.createdAt),
      minWidth: 180,
    },
    {
      key: 'membershipCount',
      name: t('label.memberships', {
        defaultValue: 'Memberships',
      }),
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => row.type === 'MASTER' && row.counts?.memberships,
      width: 100,
    },
  ]);
};
