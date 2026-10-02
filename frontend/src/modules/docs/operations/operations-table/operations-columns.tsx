import { BirdIcon } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenExtensionDefinition, GenOperationSummary } from 'sdk/docs-types';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { openOperationSheet } from '~/modules/docs/operations/operation-detail';
import { openExamplesSheet } from '~/modules/docs/operations/operation-examples';
import { SwitchedOffBadge } from '~/modules/docs/operations/switched-off-badge';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { getMethodColor } from '../../helpers/get-method-color';

/** Tag kinds whose columns start hidden, to keep the default table narrow; the columns menu shows them. */
const hiddenTagKinds = new Set(['owner', 'entity']);

interface LabelItem {
  key: string;
  label: string;
  tooltip?: string;
}

/** Comma-separated labels; one with a tooltip gets a dotted underline that brightens on hover. */
function LabelList({ items }: { items: LabelItem[] }) {
  return (
    <div className="truncate text-xs">
      {items.map(({ key, label, tooltip }, index) => (
        <Fragment key={key}>
          {index > 0 && <span className="opacity-60">, </span>}
          <span
            className={cn(
              'cursor-default',
              tooltip &&
                'text-foreground/75 underline decoration-foreground/40 decoration-dotted underline-offset-3 hover:text-foreground hover:decoration-foreground',
            )}
            data-tooltip={tooltip ? 'true' : undefined}
            data-tooltip-content={tooltip}
          >
            {label}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export const useColumns = (extensions: GenExtensionDefinition[] = [], tagKinds: string[] = []) => {
  const { t } = useTranslation();

  return useState<ColumnOrColumnGroup<GenOperationSummary>[]>(() => {
    const extensionColumns: ColumnOrColumnGroup<GenOperationSummary>[] = extensions.map((ext) => ({
      key: ext.id,
      name: ext.key
        .replace('x-', '')
        .replace(/-/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase()),
      minBreakpoint: 'md',
      resizable: true,
      width: 150,
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }: { row: GenOperationSummary }) => {
        const values = row.extensions[ext.id];
        if (!values?.length) return null;
        const items = values.map((value) => {
          const meta = ext.values?.[value];
          const label = meta?.name ?? value;
          return { key: value, label, tooltip: meta?.description ? `${value}: ${meta.description}` : label !== value ? value : undefined };
        });
        return <LabelList items={items} />;
      },
    }));

    // The tool's name is the operation id, so the cell names only that it is one and whether it asks first.
    const mcpColumn: ColumnOrColumnGroup<GenOperationSummary> = {
      key: 'mcp',
      name: 'MCP',
      minBreakpoint: 'md',
      resizable: true,
      width: 120,
      minWidth: 80,
      placeholderValue: '-',
      renderCell: ({ row }) => {
        if (!row.tool) return null;
        const items: LabelItem[] = [{ key: 'tool', label: t('c:docs.tool'), tooltip: row.tool.description }];
        if (row.tool.approvalRequired) items.push({ key: 'approval', label: t('c:docs.approval'), tooltip: t('c:docs.tool_approval.text') });
        return <LabelList items={items} />;
      },
    };

    // One column per tag kind, e.g. 'module', 'owner'
    const tagKindColumns: ColumnOrColumnGroup<GenOperationSummary>[] = tagKinds.map((kind) => ({
      key: `tag-${kind}`,
      name: kind.replace(/^\w/, (c) => c.toUpperCase()),
      hidden: hiddenTagKinds.has(kind),
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
        minWidth: 80,
        renderCell: ({ row }) => (
          <Badge variant="secondary" className={cn('bg-transparent font-mono text-xs uppercase shadow-none', getMethodColor(row.method))}>
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
            className="group w-full min-w-0 justify-start font-mono text-xs"
            onClick={(e) => openOperationSheet(row, e.currentTarget)}
          >
            {/* The underline sits on the path alone: on the button it would reach the badge too */}
            <span dir="rtl" className="block min-w-0 flex-1 truncate text-left decoration-foreground/30 underline-offset-3 group-hover:underline">
              &lrm;{row.path}
            </span>
            <SwitchedOffBadge enabledBy={row.enabledBy} />
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
          if (!row.hasResponseBody) return <span className="block w-full text-center text-muted-foreground/70 text-xs">na</span>;
          // Has response body but no example yet
          if (!row.hasExample) return <span className="block w-full text-center text-muted-foreground">-</span>;
          return (
            <Button
              variant="cell"
              size="cell"
              tabIndex={tabIndex}
              className="justify-center opacity-60 hover:opacity-100"
              aria-label={t('c:docs.view_example')}
              data-tooltip="true"
              data-tooltip-content={t('c:docs.view_example')}
              onClick={(e) => openExamplesSheet(row, e.currentTarget)}
            >
              <BirdIcon className="size-4" />
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
        minWidth: 120,
        renderCell: ({ row }) => <code className="truncate font-mono text-muted-foreground text-xs">{row.id}</code>,
      },
      {
        key: 'summary',
        name: t('c:summary'),
        hidden: true,
        sortable: true,
        resizable: true,
        renderCell: ({ row }) => <span className="truncate text-sm">{row.summary || row.id}</span>,
      },
      ...extensionColumns,
      mcpColumn,
      ...tagKindColumns,
    ];
  });
};
