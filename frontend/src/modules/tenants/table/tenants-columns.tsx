import { GlobeIcon, PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tenant } from 'sdk';
import { enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { type EllipsisOption, TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { openUpdateSheet } from '~/modules/tenants/table/update-row';
import { Badge } from '~/modules/ui/badge';
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
      name: t('c:id'),
      minBreakpoint: 'md',
      resizable: true,
      width: 100,
      renderCell: ({ row }) => <code className="font-mono text-xs">{row.id}</code>,
    },
    {
      key: 'status',
      name: t('c:status'),
      resizable: true,
      width: 100,
      editable: true,
      editorOptions: enumSelectEditorOptions,
      renderCell: ({ row }) => {
        const variant = row.status === 'active' ? 'success' : row.status === 'suspended' ? 'warning' : 'plain';
        return <Badge variant={variant}>{t(`c:${row.status}`)}</Badge>;
      },
      renderEditCell: (props) => (
        <RenderEnumSelect
          {...props}
          field="status"
          options={statusOptions}
          renderOption={(status) => t(`c:${status}`)}
        />
      ),
    },
    {
      key: 'name',
      name: t('c:name'),
      sortable: true,
      resizable: true,
      minWidth: 180,
      placeholderValue: '-',
    },
    {
      key: 'ellipsis',
      name: '',
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const ellipsisOptions: EllipsisOption<Tenant>[] = [
          {
            label: t('c:edit'),
            icon: PencilIcon,
            onSelect: (row: Tenant, triggerRef: React.RefObject<HTMLButtonElement | null>) => {
              useDropdowner.getState().remove();
              openUpdateSheet(row, triggerRef);
            },
          },
        ];

        return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
      },
    },
    {
      key: 'subscriptionStatus',
      name: t('c:subscription'),
      minBreakpoint: 'md',
      width: 140,
      placeholderValue: '-',
      renderCell: ({ row }) => {
        if (row.subscriptionStatus === 'none') return null;
        const variantMap: Record<string, 'success' | 'default' | 'destructive' | 'secondary'> = {
          active: 'success',
          trialing: 'default',
          past_due: 'destructive',
        };
        return (
          <Badge variant={variantMap[row.subscriptionStatus] ?? 'secondary'} soft>
            {t(`c:${row.subscriptionStatus}`)}
          </Badge>
        );
      },
    },
    {
      key: 'domainsCount',
      name: t('c:domain_other'),
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
      key: 'createdAt',
      name: t('c:created_at'),
      sortable: true,
      sortDescendingFirst: true,
      minBreakpoint: 'md',
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.createdAt),
    },
  ];

  return useState<ColumnOrColumnGroup<Tenant>[]>(columns);
};
