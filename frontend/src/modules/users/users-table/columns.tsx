import { Link } from '@tanstack/react-router';

import { useTranslation } from 'react-i18next';
import type { User, Member } from '~/types';

import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import { renderSelect } from '~/modules/common/data-table/select-column';
import { AvatarWrap } from '../../common/avatar-wrap';
import CheckboxColumn from '../../common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';
import RowEdit from './row-edit';
import { Pencil } from 'lucide-react';

function isMember(row: User | Member): row is Member {
  return row && 'organizationRole' in row && 'membershipId' in row;
}

export const useColumns = <T extends User | Member>(
  callback: (users: User[], action: 'create' | 'update' | 'delete') => void,
  passedColumns?: ColumnOrColumnGroup<T>[],
) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const mobileColumns: ColumnOrColumnGroup<T>[] = [
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
      renderCell: ({ row, tabIndex }) => (isMember(row) ? <Pencil size={16} /> : <RowEdit user={row} tabIndex={tabIndex} callback={callback} />),
    },
  ];
  const otherColumns: ColumnOrColumnGroup<T>[] = [
    {
      key: 'email',
      name: t('common:email'),
      sortable: true,
      visible: true,
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
      visible: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (isMember(row) ? t(row.organizationRole.toLowerCase()) : t(row.role.toLowerCase())),
      width: 100,
      renderEditCell: (props) =>
        renderSelect({
          props,
          options: [
            { label: t('common:admin'), value: 'ADMIN' },
            isMember(props.row) ? { label: t('common:member'), value: 'MEMBER' } : { label: t('common:user'), value: 'USER' },
          ],
          key: isMember(props.row) ? 'organizationRole' : 'role',
        }),
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
  ];

  return useState<ColumnOrColumnGroup<T>[]>(
    isMobile ? mobileColumns : passedColumns ? [...mobileColumns, ...otherColumns, ...passedColumns] : [...mobileColumns, ...otherColumns],
  );
};
