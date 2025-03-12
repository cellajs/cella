import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { EntityPage } from '~/modules/entities/types';
import { getMembersTableCache } from '~/modules/memberships/members-table/helpers';
import type { InvitedMember } from '~/modules/memberships/types';
import { dateShort } from '~/utils/date-short';

export const useColumns = (entity: EntityPage) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<InvitedMember>[] = [
      {
        key: 'email',
        name: t('common:email'),
        sortable: true,
        visible: true,
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
        width: 100,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <div className="inline-flex items-center gap-1 relative group h-full w-full">
            {row.role ? t(`common:${row.role}`) : <span className="text-muted">-</span>}
          </div>
        ),
      },
      {
        key: 'expiresAt',
        name: t('common:expires_at'),
        sortable: true,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.expiresAt ? dateShort(row.expiresAt) : <span className="text-muted">-</span>),
        minWidth: 80,
      },
      {
        key: 'createdAt',
        name: t('common:invited_at'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
        minWidth: 80,
      },
      {
        key: 'createdBy',
        name: t('common:invited_by'),
        sortable: true,
        visible: !isMobile,
        minWidth: 80,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => {
          if (!row.createdBy) return <span className="text-muted">-</span>;

          const items = getMembersTableCache(entity.id, entity.entity);
          const user = items.find((u) => u.id === row.createdBy);

          return (
            <Link
              id={`pending-created-by-${row.createdBy}-cell-${row.id}`}
              to="/users/$idOrSlug"
              tabIndex={tabIndex}
              params={{ idOrSlug: user?.slug ?? row.createdBy }}
              className="flex space-x-2 items-center outline-0 ring-0 group"
            >
              {user && <AvatarWrap type="user" className="h-8 w-8" id={user.id} name={user.name} url={user.thumbnailUrl} />}
              <span className="group-hover:underline underline-offset-4 truncate font-medium">{user?.name ?? row.createdBy}</span>
            </Link>
          );
        },
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<InvitedMember>[]>(columns);
};
