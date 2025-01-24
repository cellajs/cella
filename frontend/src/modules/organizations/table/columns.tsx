import { useTranslation } from 'react-i18next';
import type { Organization } from '~/types/common';

import { Link } from '@tanstack/react-router';
import { config } from 'config';
import { Shield, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { renderSelect } from '~/modules/common/data-table/select-column';
import UpdateRow from '~/modules/organizations/table/update-row';
import { dateShort } from '~/utils/date-short';

export const useColumns = (callback: (organizations: Organization[]) => void) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<Organization>[] = [
      CheckboxColumn,
      {
        key: 'name',
        name: t('common:name'),
        visible: true,
        sortable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => (
          <Link
            to="/$idOrSlug/members"
            tabIndex={tabIndex}
            params={{ idOrSlug: row.slug }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
          >
            <AvatarWrap type="organization" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
          </Link>
        ),
      },
      {
        key: 'edit',
        name: '',
        visible: true,
        width: 32,
        renderCell: ({ row, tabIndex }) => {
          if (row.counts.memberships.admins > 0 || row.counts.memberships.members > 0)
            return <UpdateRow organization={row} tabIndex={tabIndex} callback={callback} />;
        },
      },
      {
        key: 'role',
        name: t('common:your_role'),
        sortable: false,
        visible: !isMobile,
        width: 120,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.membership?.role ? t(`common:${row.membership.role}`) : <span className="text-muted">-</span>),
        renderEditCell: ({ row, onRowChange }) =>
          renderSelect({
            row,
            onRowChange,
            options: config.rolesByType.entityRoles,
          }),
      },
      {
        key: 'subscription',
        name: t('common:subscription'),
        sortable: false,
        visible: !isMobile,
        minWidth: 140,
        renderHeaderCell: HeaderCell,
        renderCell: () => <span className="text-muted">-</span>,
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        visible: !isMobile,
        minWidth: 180,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
      },
      {
        key: 'memberCount',
        name: t('common:members'),
        sortable: false,
        visible: !isMobile,
        width: 140,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <>
            <UserRound className="mr-2 opacity-50" size={16} />
            {row.counts.memberships.members}
          </>
        ),
      },
      {
        key: 'adminCount',
        name: t('common:admins'),
        sortable: false,
        visible: !isMobile,
        width: 140,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <>
            <Shield className="mr-2 opacity-50" size={16} />
            {row.counts.memberships.admins}
          </>
        ),
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<Organization>[]>(columns);
};
