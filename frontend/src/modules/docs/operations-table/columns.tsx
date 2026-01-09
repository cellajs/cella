import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from '~/api.gen/docs';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { Badge } from '~/modules/ui/badge';
import { Input } from '~/modules/ui/input';
import { getMethodColor } from '../helpers/get-method-color';

export const useColumns = (isCompact: boolean) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<GenOperationSummary>[] = [
      {
        key: 'method',
        name: t('common:method'),
        visible: true,
        sortable: true,
        resizable: false,
        width: 100,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <Badge
            variant="secondary"
            className={`font-mono uppercase text-xs bg-transparent shadow-none ${getMethodColor(row.method)}`}
          >
            {row.method.toUpperCase()}
          </Badge>
        ),
      },
      {
        key: 'path',
        name: t('common:path'),
        minWidth: 200,
        sortable: false,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <div className="font-mono text-sm truncate hover:underline underline-offset-3 decoration-foreground/30">
            {row.path}
          </div>
        ),
      },
      {
        key: 'summary',
        name: t('common:summary'),
        visible: !isMobile || !isCompact,
        sortable: true,
        resizable: true,
        editable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <span className="truncate">{row.summary || row.id}</span>,
        renderEditCell: ({ row, onRowChange }) => (
          <Input value={row.summary} onChange={(e) => onRowChange({ ...row, summary: e.target.value })} autoFocus />
        ),
      },
      {
        key: 'id',
        name: t('common:docs.operation_id'),
        sortable: true,
        resizable: true,
        width: 200,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <code className="text-xs text-muted-foreground font-mono">{row.id}</code>,
      },
    ];

    return cols;
  }, [t]);

  return useState<ColumnOrColumnGroup<GenOperationSummary>[]>(columns);
};
