import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tenant } from '~/api.gen';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { HeaderCell } from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { Badge } from '~/modules/ui/badge';
import { dateShort } from '~/utils/date-short';

/**
 * Column configuration for the tenants table.
 */
export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<Tenant>[] = [
      CheckboxColumn,
      {
        key: 'id',
        name: t('common:id'),
        sortable: false,
        visible: true,
        resizable: true,
        width: 100,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <code className="text-xs font-mono">{row.id}</code>,
      },
      {
        key: 'name',
        name: t('common:name'),
        sortable: true,
        visible: true,
        resizable: true,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <span className="font-medium">{row.name}</span>,
      },
      {
        key: 'status',
        name: t('common:status'),
        sortable: false,
        visible: true,
        resizable: true,
        width: 120,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => {
          const variant = row.status === 'active' ? 'success' : row.status === 'suspended' ? 'secondary' : 'plain';
          return <Badge variant={variant}>{t(`common:${row.status}`)}</Badge>;
        },
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        visible: !isMobile,
        resizable: true,
        width: 180,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<Tenant>[]>(columns);
};
