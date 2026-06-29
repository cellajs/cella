import { BirdIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { openOperationSheet } from '~/modules/docs/operations/operation-detail';
import { openExamplesSheet } from '~/modules/docs/operations/operation-examples';
import type { GenExtensionDefinition, GenOperationSummary } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { getMethodColor } from '../../helpers/get-method-color';

export const useColumns = (extensions: GenExtensionDefinition[] = [], tagKinds: string[] = []) => {
  const { t } = useTranslation();

  return useState<ColumnOrColumnGroup<GenOperationSummary>[]>(() => {
    // Generate extension columns dynamically from extension definitions
    const extensionColumns: ColumnOrColumnGroup<GenOperationSummary>[] = extensions.map((ext) => ({
      key: ext.id,
      name: ext.key
        .replace('x-', '')
        .replace(/-/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase()),
      minBreakpoint: 'md',
      resizable: true,
      width: 150,
      placeholderValue: '-',
      renderCell: ({ row }: { row: GenOperationSummary }) => {
        const values = row.extensions[ext.id];
        if (!values?.length) return null;
        return (
          <div className="flex flex-wrap gap-1 truncate font-mono text-xs">
            {values.map((value: string) => {
              const meta = ext.values?.[value];
              const label = meta?.name ?? value;
              const tooltipContent = meta?.description
                ? `${value} — ${meta.description}`
                : label !== value
                  ? value
                  : undefined;
              return (
                <code
                  key={value}
                  className="inline-block cursor-default truncate"
                  data-tooltip={tooltipContent ? 'true' : undefined}
                  data-tooltip-content={tooltipContent}
                >
                  {label}
                </code>
              );
            })}
          </div>
        );
      },
    }));

    // Generate tag kind columns dynamically (one column per kind, e.g., 'module', 'owner')
    const tagKindColumns: ColumnOrColumnGroup<GenOperationSummary>[] = tagKinds.map((kind) => ({
      key: `tag-${kind}`,
      name: kind.replace(/^\w/, (c) => c.toUpperCase()),
      sortable: true,
      minBreakpoint: 'md',
      resizable: true,
      minWidth: 80,
      placeholderValue: '-',
      renderCell: ({ row }: { row: GenOperationSummary }) => {
        const values = row.tagsByKind?.[kind];
        if (!values?.length) return null;
        return (
          <div className="flex flex-wrap gap-1">
            {values.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        );
      },
    }));

    return [
      {
        key: 'method',
        name: t('c:method'),
        sortable: true,
        width: 80,
        renderCell: ({ row }) => (
          <Badge
            variant="secondary"
            className={`bg-transparent font-mono text-xs uppercase shadow-none ${getMethodColor(row.method)}`}
          >
            {row.method.toUpperCase()}
          </Badge>
        ),
      },
      {
        key: 'path',
        name: t('c:path'),
        minWidth: 180,
        resizable: true,
        sortable: true,
        renderCell: ({ row, tabIndex }) => (
          <Button
            variant="cell"
            size="cell"
            tabIndex={tabIndex}
            title={row.path}
            className="w-full min-w-0 justify-start font-mono text-xs decoration-foreground/30 underline-offset-3 hover:underline"
            onClick={(e) => openOperationSheet(row, e.currentTarget)}
          >
            <span dir="rtl" className="block min-w-0 flex-1 truncate text-left">
              &lrm;{row.path}
            </span>
          </Button>
        ),
      },
      {
        key: 'hasExample',
        name: '',
        minBreakpoint: 'sm',
        width: 50,
        renderCell: ({ row, tabIndex }) => {
          // No response body means examples are not applicable
          if (!row.hasResponseBody)
            return <span className="block w-full text-center text-muted-foreground/50 text-xs">na</span>;
          // Has response body but no example yet
          if (!row.hasExample) return <span className="block w-full text-center text-muted-foreground">-</span>;
          return (
            <Button
              variant="cell"
              size="cell"
              tabIndex={tabIndex}
              className="justify-center opacity-60 hover:opacity-100"
              onClick={(e) => openExamplesSheet(row, e.currentTarget)}
            >
              <BirdIcon className="h-4 w-4" />
            </Button>
          );
        },
      },
      {
        key: 'id',
        name: t('c:docs.operation_id'),
        sortable: true,
        minBreakpoint: 'md',
        resizable: true,
        width: 200,
        renderCell: ({ row }) => <code className="truncate font-mono text-muted-foreground/80 text-xs">{row.id}</code>,
      },
      {
        key: 'summary',
        name: t('c:summary'),
        hidden: true,
        sortable: true,
        resizable: true,
        editable: true,
        renderCell: ({ row }) => <span className="truncate text-sm">{row.summary || row.id}</span>,
        renderEditCell: ({ row, onRowChange }) => (
          <Input value={row.summary} onChange={(e) => onRowChange({ ...row, summary: e.target.value })} autoFocus />
        ),
      },
      // Insert dynamically generated extension columns
      ...extensionColumns,
      // Insert dynamically generated tag kind columns
      ...tagKindColumns,
    ];
  });
};
