import { Link } from '@tanstack/react-router';
import { ColumnDef } from '@tanstack/react-table';

import { useTranslation } from 'react-i18next';
import { Member } from '~/types';
import { AvatarWrap } from '../avatar-wrap';

import DataTableColumnHeader from '~/components/data-table/column-header';
import { Checkbox } from '~/components/ui/checkbox';
import { dateShort } from '~/lib/utils';

export const useColumns = (): ColumnDef<Member>[] => {
  const { t } = useTranslation();

  return [
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
      accessorKey: 'organizationRole',
      enableSorting: false,
      accessorFn: (row) => t(row.organizationRole),
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
      accessorKey: 'lastSeenAt',
      accessorFn: (row) => dateShort(row.lastSeenAt),
      minSize: 180,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('label.lastSeenAt', {
            defaultValue: 'Last seen',
          })}
        />
      ),
    },
  ];
};
