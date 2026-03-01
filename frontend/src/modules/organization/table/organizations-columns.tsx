import { Link } from '@tanstack/react-router';
import { ShieldIcon, UserRoundIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { roles } from 'shared';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { HeaderCell } from '~/modules/common/data-table/header-cell';
import { renderSelect } from '~/modules/common/data-table/select-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { UpdateRow } from '~/modules/organization/table/update-row';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { buttonVariants } from '~/modules/ui/button';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (isCompact: boolean) => {
  const { t } = useTranslation();

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<EnrichedOrganization>[] = [
      CheckboxColumn,
      {
        key: 'name',
        name: t('common:name'),
        sortable: true,
        resizable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => (
          <Link
            className={buttonVariants({ variant: 'cell', size: 'cell' })}
            to="/$tenantId/$orgSlug/organization/members"
            draggable="false"
            tabIndex={tabIndex}
            params={{ tenantId: row.tenantId, orgSlug: row.slug }}
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
        width: 32,
        renderCell: ({ row, tabIndex }) => {
          if ((row.included.counts?.membership.admin ?? 0) > 0 || (row.included.counts?.membership.member ?? 0) > 0)
            return <UpdateRow organization={row} tabIndex={tabIndex} />;
        },
      },
      {
        key: 'role',
        name: t('common:your_role'),
        sortable: false,
        minBreakpoint: 'md',
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
            options: roles.all,
          }),
      },
      {
        key: 'subscription',
        name: t('common:subscription'),
        sortable: false,
        minBreakpoint: 'md',
        resizable: true,
        minWidth: 140,
        renderHeaderCell: HeaderCell,
        renderCell: () => <span className="text-muted">-</span>,
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        minBreakpoint: 'md',
        resizable: true,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.createdAt),
      },
      {
        key: 'createdBy',
        name: t('common:created_by'),
        sortable: false,
        hidden: true,
        resizable: true,
        minWidth: isCompact ? null : 120,
        width: isCompact ? 50 : null,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row, tabIndex }) =>
          row.createdBy && <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />,
      },
      {
        key: 'memberCount',
        name: t('common:members'),
        sortable: false,
        minBreakpoint: 'md',
        width: 140,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <>
            <UserRoundIcon className="mr-2 opacity-50" size={16} />
            {row.included.counts?.membership.member ?? '-'}
          </>
        ),
      },
      {
        key: 'adminCount',
        name: t('common:admins'),
        sortable: false,
        minBreakpoint: 'md',
        width: 140,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <>
            <ShieldIcon className="mr-2 opacity-50" size={16} />
            {row.included.counts?.membership.admin ?? '-'}
          </>
        ),
      },
    ];

    return cols;
  }, [isCompact]);

  return useState<ColumnOrColumnGroup<EnrichedOrganization>[]>(columns);
};
