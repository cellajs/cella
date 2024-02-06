import { Link } from '@tanstack/react-router';
import { ColumnDef } from '@tanstack/react-table';

import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { User } from '~/types';

import { dateShort } from '~/lib/utils';
import { AvatarWrap } from '../avatar-wrap';
import { DataTableColumnHeader } from '../data-table/column-header';
import RowActions from './row-actions';

export const useColumns = (callback: (user: User, action: 'create' | 'update' | 'delete') => void): ColumnDef<User>[] => {
  const { t } = useTranslation();

  return [
    {
      id: 'expand',
      size: 32,
      header: () => <div role="button" />,
      cell: ({ row }) => {
        return (
          <Button size="icon" variant="ghost" className="h-8 w-8 group -ml-2 relative -mr-2" role="button" onClick={row.getToggleExpandedHandler()}>
            <ChevronRight
              size={16}
              className={`cursor-pointer opacity-50 transition-transform group-hover:opacity-75 ${row.getIsExpanded() ? 'rotate-90' : 'rotate-0'}`}
            />
          </Button>
        );
      },
    },
    {
      id: 'select',
      size: 32,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[2px]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      minSize: 200,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('label.name', {
            defaultValue: 'Name',
          })}
        />
      ),
      cell: ({ row }) => {
        const item = row.original;
        return (
          <Link
            to="/user/$userIdentifier"
            params={{
              userIdentifier: item.slug,
            }}
            className="flex space-x-2 items-center group"
          >
            <AvatarWrap type="user" className="h-8 w-8" id={item.id} name={item.name} url={item.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{item.name}</span>
          </Link>
        );
      },
    },
    {
      accessorKey: 'Actions',
      id: 'actions',
      size: 32,
      cell: (ctx) => <RowActions user={ctx.row.original} callback={callback} />,
    },
    {
      accessorKey: 'email',
      enableSorting: false,
      minSize: 180,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('label.email', {
            defaultValue: 'Email',
          })}
        />
      ),
      cell: ({ row }) => {
        return (
          <a href={`mailto:${row.getValue('email')}`} className="truncate hover:underline underline-offset-4 font-light">
            {row.getValue('email') || '-'}
          </a>
        );
      },
    },
    {
      accessorKey: 'role',
      enableSorting: false,
      accessorFn: (row) => t(row.role),
      size: 100,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('label.role', {
            defaultValue: 'Role',
          })}
        />
      ),
    },
    {
      accessorKey: 'createdAt',
      accessorFn: (row) => dateShort(row.createdAt),
      minSize: 180,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('label.createdAt', {
            defaultValue: 'Created',
          })}
        />
      ),
    },
    {
      accessorKey: 'counts.memberships',
      enableSorting: false,
      size: 100,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('label.memberships', {
            defaultValue: 'Memberships',
          })}
        />
      ),
    },
  ];
};
