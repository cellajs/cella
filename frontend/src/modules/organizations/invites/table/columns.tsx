import { useTranslation } from 'react-i18next';
import type { OrganizationInvitesInfo } from '~/types/common';

import { Link } from '@tanstack/react-router';
import { config } from 'config';
import { useMemo, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<OrganizationInvitesInfo>[] = [
      {
        key: 'email',
        name: t('common:email'),
        sortable: false,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => row.email,
        minWidth: 120,
      },
      {
        key: 'user',
        name: t('common:user'),
        sortable: false,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) =>
          row.name && row.userId ? (
            <Link
              id={`user-cell-${row.userId}`}
              to="/users/$idOrSlug"
              tabIndex={tabIndex}
              params={{ idOrSlug: row.userId }}
              className="flex space-x-2 items-center outline-0 ring-0 group"
            >
              <AvatarWrap type="user" className="h-8 w-8" id={row.userId} name={row.name} />
              <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
            </Link>
          ) : (
            t('common:user_not_part_of_app', { appName: config.name })
          ),

        minWidth: 100,
      },
      {
        key: 'createdAt',
        name: t('common:invited_at'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => dateShort(row.createdAt),
        minWidth: 80,
      },
      {
        key: 'createdBy',
        name: t('common:invited_by'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => row.createdBy,
        minWidth: 80,
      },
      {
        key: 'expiresAt',
        name: t('common:expires_at'),
        sortable: true,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => dateShort(row.expiresAt),
        minWidth: 80,
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<OrganizationInvitesInfo>[]>(columns);
};
