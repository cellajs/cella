import { Link } from '@tanstack/react-router';
import { BoxIcon, ShieldIcon, UserRoundIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, roles } from 'shared';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { renderSelect } from '~/modules/common/data-table/select-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';
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
        renderCell: ({ row, tabIndex }) => (
          <Link
            className={buttonVariants({ variant: 'cell', size: 'cell' })}
            to="/$tenantId/$orgSlug/organization/members"
            draggable="false"
            tabIndex={tabIndex}
            params={{ tenantId: row.tenantId, orgSlug: row.slug }}
          >
            <EntityAvatar
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
        renderCell: () => <span className="text-muted">-</span>,
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        minBreakpoint: 'md',
        resizable: true,
        minWidth: 160,
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
        placeholderValue: '-',
        renderCell: ({ row, tabIndex }) =>
          row.createdBy && <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />,
      },
      // Dynamic membership count columns from role config
      ...roles.all.map((role) => ({
        key: `${role}Count`,
        name: t(`common:${role}s`),
        sortable: false,
        minBreakpoint: 'md' as const,
        minWidth: 60,
        maxWidth: 140,
        renderCell: ({ row }: { row: EnrichedOrganization }) => (
          <>
            {role === 'admin' ? (
              <ShieldIcon className="mr-2 opacity-50" size={16} />
            ) : (
              <UserRoundIcon className="mr-2 opacity-50" size={16} />
            )}
            {row.included.counts?.membership[role] ?? '-'}
          </>
        ),
      })),
      // Dynamic entity count columns for org-scoped product entities
      ...appConfig.productEntityTypes
        .filter(
          (type) =>
            !appConfig.parentlessProductEntityTypes.includes(
              type as (typeof appConfig.parentlessProductEntityTypes)[number],
            ),
        )
        .map((type) => ({
          key: `${type}Count`,
          name: t(`common:${type}`, { count: 2 }),
          sortable: false,
          minBreakpoint: 'md' as const,
          minWidth: 60,
          maxWidth: 140,
          renderCell: ({ row }: { row: EnrichedOrganization }) => (
            <>
              <BoxIcon className="mr-2 opacity-50" size={16} />
              {row.included.counts?.entities[type] ?? '-'}
            </>
          ),
        })),
    ];

    return cols;
  }, [isCompact]);

  return useState<ColumnOrColumnGroup<EnrichedOrganization>[]>(columns);
};
