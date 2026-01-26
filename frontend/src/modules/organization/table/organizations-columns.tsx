import { Link } from '@tanstack/react-router';
import { allEntityRoles } from 'config';
import { ShieldIcon, UserRoundIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from '~/api.gen';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { renderSelect } from '~/modules/common/data-table/select-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import UpdateRow from '~/modules/organization/table/update-row';
import { UserCellById } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (isCompact: boolean) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<Organization>[] = [
      CheckboxColumn,
      {
        key: 'name',
        name: t('common:name'),
        visible: true,
        sortable: true,
        resizable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => (
          <Link
            to="/$idOrSlug/organization/members"
            draggable="false"
            tabIndex={tabIndex}
            params={{ idOrSlug: row.slug }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
          >
            <AvatarWrap
              type="organization"
              className="h-8 w-8 group-active:translate-y-[.05rem]"
              id={row.id}
              name={row.name}
              url={row.thumbnailUrl}
            />
            <span className="group-hover:underline underline-offset-3 decoration-foreground/20 group-active:decoration-foreground/50 group-active:translate-y-[.05rem] truncate font-medium">
              {row.name || '-'}
            </span>
          </Link>
        ),
      },
      {
        key: 'edit',
        name: '',
        visible: true,
        width: 32,
        renderCell: ({ row, tabIndex }) => {
          if ((row.counts?.membership.admin ?? 0) > 0 || (row.counts?.membership.member ?? 0) > 0)
            return <UpdateRow organization={row} tabIndex={tabIndex} />;
        },
      },
      {
        key: 'role',
        name: t('common:your_role'),
        sortable: false,
        visible: !isMobile,
        resizable: true,
        width: 120,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) =>
          row.membership?.role ? (
            t(`${row.membership.role}`, { ns: ['app', 'common'] })
          ) : (
            <span className="text-muted">-</span>
          ),
        renderEditCell: ({ row, onRowChange }) =>
          renderSelect({
            row,
            onRowChange,
            options: allEntityRoles,
          }),
      },
      {
        key: 'subscription',
        name: t('common:subscription'),
        sortable: false,
        visible: !isMobile,
        resizable: true,
        minWidth: 140,
        renderHeaderCell: HeaderCell,
        renderCell: () => <span className="text-muted">-</span>,
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        visible: !isMobile,
        resizable: true,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
      },
      {
        key: 'createdBy',
        name: t('common:created_by'),
        sortable: false,
        visible: false,
        resizable: true,
        minWidth: isCompact ? null : 120,
        width: isCompact ? 50 : null,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => (
          <UserCellById userId={row.createdBy} cacheOnly={false} tabIndex={tabIndex} />
        ),
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
            <UserRoundIcon className="mr-2 opacity-50" size={16} />
            {row.counts?.membership.member ?? '-'}
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
            <ShieldIcon className="mr-2 opacity-50" size={16} />
            {row.counts?.membership.admin ?? '-'}
          </>
        ),
      },
    ];

    return cols;
  }, [isCompact]);

  return useState<ColumnOrColumnGroup<Organization>[]>(columns);
};
