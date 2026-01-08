import { useMemo, useState } from 'react';
import type { GenOperationSummary } from '~/api.gen/docs';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { Badge } from '~/modules/ui/badge';
import { Input } from '~/modules/ui/input';
import { getMethodColor } from '../helpers/get-method-color';

export const useColumns = () => {
  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<GenOperationSummary>[] = [
      {
        key: 'method',
        name: 'Method',
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
        key: 'summary',
        name: 'Summary',
        visible: true,
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
        name: 'Operation ID',
        visible: true,
        sortable: true,
        resizable: true,
        width: 200,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <code className="text-xs text-muted-foreground font-mono">{row.id}</code>,
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<GenOperationSummary>[]>(columns);
};
