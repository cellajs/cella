import { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { Organization } from '~/types';

import { Link } from '@tanstack/react-router';
import { dateShort } from '~/lib/utils';
import { AvatarWrap } from '../avatar-wrap';
import { DataTableColumnHeader } from '../data-table/column-header';
import RowActions from './row-actions';

export const useColumns = (callback: (organization: Organization, action: 'create' | 'update' | 'delete') => void): ColumnDef<Organization>[] => {
  const { t } = useTranslation();

  return [
    // {
    //   id: 'select',
    //   header: ({ table }) => (
    //     <Checkbox
    //       checked={table.getIsAllPageRowsSelected()}
    //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
    //       aria-label="Select all"
    //       className="translate-y-[2px]"
    //     />
    //   ),
    //   cell: ({ row }) => (
    //     <Checkbox
    //       checked={row.getIsSelected()}
    //       onCheckedChange={(value) => row.toggleSelected(!!value)}
    //       aria-label="Select row"
    //       className="translate-y-[2px]"
    //     />
    //   ),
    //   enableSorting: false,
    //   enableHiding: false,
    // },
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
          <Link to="/$organizationIdentifier" params={{ organizationIdentifier: item.slug }} className="flex space-x-2 items-center group">
            <AvatarWrap type="organization" className="h-8 w-8" id={item.id} name={item.name} url={item.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{item.name}</span>
          </Link>
        );
      },
    },
    {
      accessorKey: 'userRole',
      enableSorting: false,
      accessorFn: (row) => (row.userRole ? t(row.userRole) : ''),
      size: 100,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('label.your_role', {
            defaultValue: 'Your role',
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
      id: 'actions',
      cell: (ctx) => ctx.row.original.userRole === 'ADMIN' && <RowActions organization={ctx.row.original} callback={callback} />,
    },
  ];
};
