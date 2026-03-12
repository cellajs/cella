import { Link } from '@tanstack/react-router';
import i18n from 'i18next';
import { BoxIcon, PencilIcon, ShieldIcon, TrashIcon, UserRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, roles } from 'shared';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { RenderSelect } from '~/modules/common/data-table/select-column';
import { type EllipsisOption, TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { PopConfirm } from '~/modules/common/popconfirm';
import { DeleteOrganizations } from '~/modules/organization/delete-organizations';
import { openUpdateSheet, UpdateRow } from '~/modules/organization/table/update-row';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { buttonVariants } from '~/modules/ui/button';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (isCompact: boolean) => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<EnrichedOrganization>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      sortable: true,
      minWidth: 200,
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
      minBreakpoint: 'md',
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        if ((row.included.counts?.membership.admin ?? 0) > 0 || (row.included.counts?.membership.member ?? 0) > 0)
          return <UpdateRow organization={row} tabIndex={tabIndex} />;
      },
    },
    {
      key: 'ellipsis',
      name: '',
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const ellipsisOptions: EllipsisOption<EnrichedOrganization>[] = [
          {
            label: i18n.t('common:edit'),
            icon: PencilIcon,
            onSelect: (row, triggerRef) => {
              useDropdowner.getState().remove();
              openUpdateSheet(row, triggerRef);
            },
          },
          {
            label: i18n.t('common:delete'),
            icon: TrashIcon,
            onSelect: (row) => {
              const { update } = useDropdowner.getState();
              const callback = () => useDropdowner.getState().remove();

              update({
                content: (
                  <PopConfirm title={i18n.t('common:delete_confirm.text', { name: row.name })}>
                    <DeleteOrganizations tenantId={row.tenantId} organizations={[row]} callback={callback} />
                  </PopConfirm>
                ),
              });
            },
          },
        ];

        return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
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
        RenderSelect({
          row,
          onRowChange,
          options: roles.all,
        }),
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

  return useState<ColumnOrColumnGroup<EnrichedOrganization>[]>(columns);
};
