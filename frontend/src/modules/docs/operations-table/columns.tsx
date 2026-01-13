import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { GenOperationSummary } from '~/modules/docs/types';
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
        resizable: false,
        width: 80,
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
        minWidth: 180,
        visible: true,
        resizable: true,
        sortable: false,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <div className="font-mono text-xs truncate hover:underline underline-offset-3 decoration-foreground/30">
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
        renderCell: ({ row }) => <span className="truncate text-sm">{row.summary || row.id}</span>,
        renderEditCell: ({ row, onRowChange }) => (
          <Input value={row.summary} onChange={(e) => onRowChange({ ...row, summary: e.target.value })} autoFocus />
        ),
      },
      {
        key: 'xGuard',
        name: t('common:docs.guard'),
        visible: !isMobile,
        sortable: false,
        resizable: true,
        width: 150,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) =>
          row.xGuard?.length ? (
            <div className="flex flex-wrap gap-1">
              {row.xGuard.map((guard) => (
                <span key={guard} className="text-xs">
                  {guard}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        key: 'xRateLimiter',
        name: t('common:docs.rate_limiter'),
        visible: !isMobile,
        sortable: false,
        resizable: true,
        width: 150,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) =>
          row.xRateLimiter?.length ? (
            <div className="flex flex-wrap gap-1">
              {row.xRateLimiter.map((limiter) => (
                <span key={limiter} className="text-xs">
                  {limiter}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        key: 'id',
        name: t('common:docs.operation_id'),
        sortable: true,
        visible: true,
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
