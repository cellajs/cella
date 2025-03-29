import { config } from 'config';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { renderSelect } from '~/modules/common/data-table/select-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { Member } from '~/modules/memberships/types';
import UserCell from '~/modules/users/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (isAdmin: boolean, isSheet: boolean) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = () => {
    const cols: ColumnOrColumnGroup<Member>[] = [
      // For admins add checkbox column
      ...(isAdmin ? [CheckboxColumn] : []),
      {
        key: 'name',
        name: t('common:name'),
        visible: true,
        sortable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => <UserCell user={row} tabIndex={tabIndex} orgIdOrSlug={row.membership.organizationId} />,
      },
      {
        key: 'email',
        name: t('common:email'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        minWidth: 140,
        renderCell: ({ row, tabIndex }) => {
          if (!row.email) return <span className="text-muted">-</span>;
          return (
            <a href={`mailto:${row.email}`} tabIndex={tabIndex} className="truncate hover:underline underline-offset-4 outline-0 ring-0 font-light">
              {row.email}
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
        renderCell: ({ row }) => (
          <div className="inline-flex items-center gap-1 relative group h-full w-full">
            {row.membership ? t(`common:${row.membership.role}`) : <span className="text-muted">-</span>}
          </div>
        ),
        width: 100,
        ...(isAdmin && {
          renderEditCell: ({ row, onRowChange }) =>
            renderSelect({
              row,
              onRowChange,
              options: config.rolesByType.entityRoles,
            }),
        }),
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        visible: !isSheet && !isMobile,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
      },
      {
        key: 'lastSeenAt',
        name: t('common:last_seen_at'),
        sortable: true,
        visible: !isMobile,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.lastSeenAt ? dateShort(row.lastSeenAt) : <span className="text-muted">-</span>),
      },
    ];

    return cols;
  };

  return useState<ColumnOrColumnGroup<Member>[]>(columns);
};
