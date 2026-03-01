import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { roles } from 'shared';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { HeaderCell } from '~/modules/common/data-table/header-cell';
import { renderSelect } from '~/modules/common/data-table/select-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { Member } from '~/modules/memberships/types';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (isAdmin: boolean, isSheet: boolean) => {
  const { t } = useTranslation();

  const columns = () => {
    const cols: ColumnOrColumnGroup<Member>[] = [
      // For admins add checkbox column
      ...(isAdmin ? [CheckboxColumn] : []),
      {
        key: 'name',
        name: t('common:name'),
        sortable: true,
        resizable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => <UserCell user={row} tabIndex={tabIndex} className="font-medium" />,
      },
      {
        key: 'email',
        name: t('common:email'),
        sortable: false,
        minBreakpoint: 'md',
        resizable: true,
        renderHeaderCell: HeaderCell,
        minWidth: 140,
        placeholderValue: '-',
        renderCell: ({ row, tabIndex }) => {
          if (!row.email) return null;
          return (
            <a
              href={`mailto:${row.email}`}
              tabIndex={tabIndex}
              className="truncate hover:underline underline-offset-4 decoration-foreground/20 outline-0 ring-0 font-light"
            >
              {row.email}
            </a>
          );
        },
      },
      {
        key: 'role',
        name: t('common:role'),
        sortable: true,
        resizable: true,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row }) =>
          row.membership ? (
            <div className="inline-flex items-center gap-1 relative group h-full w-full">
              {t(row.membership.role, {
                ns: ['app', 'common'],
                defaultValue: row.membership.role,
              })}
            </div>
          ) : null,
        width: 100,
        ...(isAdmin && {
          renderEditCell: ({ row, onRowChange }) =>
            renderSelect({
              row,
              onRowChange,
              options: roles.all,
            }),
        }),
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        hidden: isSheet,
        minBreakpoint: 'md',
        minWidth: 160,
        resizable: true,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.createdAt),
      },
      {
        key: 'lastSeenAt',
        name: t('common:last_seen_at'),
        sortable: true,
        minBreakpoint: 'md',
        resizable: true,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.lastSeenAt),
      },
    ];

    return cols;
  };

  return useState<ColumnOrColumnGroup<Member>[]>(columns);
};
