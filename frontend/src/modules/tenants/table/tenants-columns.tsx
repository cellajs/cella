import i18n from 'i18next';
import { GlobeIcon, PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tenant } from '~/api.gen';
import { type EllipsisOption, TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { openManageDomainsSheet } from '~/modules/tenants/domains/manage-domains-sheet';
import { openUpdateSheet, UpdateRow } from '~/modules/tenants/table/update-row';
import { Badge } from '~/modules/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { dateShort } from '~/utils/date-short';

const statusOptions = ['active', 'suspended', 'archived'] as const;

/**
 * Column configuration for the tenants table.
 */
export const useColumns = () => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<Tenant>[] = [
    {
      key: 'id',
      name: t('common:id'),
      sortable: false,
      minBreakpoint: 'md',
      resizable: true,
      width: 100,
      renderCell: ({ row }) => <code className="text-xs font-mono">{row.id}</code>,
    },
    {
      key: 'status',
      name: t('common:status'),
      sortable: false,
      resizable: true,
      width: 100,
      renderCell: ({ row }) => {
        const variant = row.status === 'active' ? 'success' : row.status === 'suspended' ? 'secondary' : 'plain';
        return <Badge variant={variant}>{t(`common:${row.status}`)}</Badge>;
      },
      renderEditCell: ({ row, onRowChange }) => {
        const onChooseValue = (value: string) => {
          setTimeout(() => onRowChange({ ...row, status: value as Tenant['status'] }, true));
        };
        return (
          <Select open={true} value={row.status} onValueChange={onChooseValue}>
            <SelectTrigger className="h-8 border-none p-2 text-xs tracking-wider">
              <SelectValue placeholder={row.status} />
            </SelectTrigger>
            <SelectContent sideOffset={-41} alignOffset={-5} className="duration-0!">
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {i18n.t(`common:${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: 'name',
      name: t('common:name'),
      sortable: true,
      resizable: true,
      minWidth: 180,
      renderCell: ({ row }) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'subscriptionStatus',
      name: t('common:subscription'),
      sortable: false,
      minBreakpoint: 'md',
      width: 140,
      renderCell: ({ row }) => {
        if (row.subscriptionStatus === 'none') return <span className="text-muted">-</span>;
        const variantMap: Record<string, 'success' | 'default' | 'destructive' | 'secondary'> = {
          active: 'success',
          trialing: 'default',
          past_due: 'destructive',
        };
        return (
          <Badge variant={variantMap[row.subscriptionStatus] ?? 'secondary'} soft>
            {t(`common:${row.subscriptionStatus}`)}
          </Badge>
        );
      },
    },
    {
      key: 'domainsCount',
      name: t('common:domains'),
      sortable: false,
      minBreakpoint: 'md',
      width: 100,
      renderCell: ({ row }) => (
        <>
          <GlobeIcon className="mr-2 opacity-50" size={16} />
          {row.domainsCount ?? 0}
        </>
      ),
    },
    {
      key: 'edit',
      name: '',
      sortable: false,
      minBreakpoint: 'md',
      width: 32,
      renderCell: ({ row, tabIndex }) => <UpdateRow tenant={row} tabIndex={tabIndex} />,
    },
    {
      key: 'ellipsis',
      name: '',
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const isMobile = window.innerWidth < 640;

        const ellipsisOptions: EllipsisOption<Tenant>[] = [
          ...(isMobile
            ? [
                {
                  label: i18n.t('common:edit'),
                  icon: PencilIcon,
                  onSelect: (row: Tenant, triggerRef: React.RefObject<HTMLButtonElement | null>) => {
                    useDropdowner.getState().remove();
                    openUpdateSheet(row, triggerRef);
                  },
                },
              ]
            : []),
          {
            label: i18n.t('common:manage_domains'),
            icon: GlobeIcon,
            onSelect: (row: Tenant, triggerRef: React.RefObject<HTMLButtonElement | null>) => {
              useDropdowner.getState().remove();
              openManageDomainsSheet(row, triggerRef);
            },
          },
        ];

        return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
      },
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: true,
      minBreakpoint: 'md',
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.createdAt),
    },
  ];

  return useState<ColumnOrColumnGroup<Tenant>[]>(columns);
};
