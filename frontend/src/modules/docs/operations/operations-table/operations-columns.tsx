import { BirdIcon } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenExtensionDefinition, GenOperationSummary } from 'sdk/docs-types';
import { cellLinkTextClass } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { upperFirst } from '~/modules/docs/helpers/upper-first';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import { openOperationSheet } from '~/modules/docs/operations/operation-detail';
import { openExamplesSheet } from '~/modules/docs/operations/operation-examples';
import { SwitchedOffBadge } from '~/modules/docs/operations/switched-off-badge';
import { TagBadges } from '~/modules/docs/tag-table';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** Tag kinds whose columns start hidden, to keep the default table narrow; the columns menu shows them. */
const hiddenTagKinds = new Set(['owner', 'entity']);

/** Tag kinds shown as plain small text; the other kinds get a badge per value. */
const plainTagKinds = new Set(['owner']);

interface LabelItem {
  key: string;
  label: string;
  tooltip?: string;
}

/** Comma-separated labels; one with a tooltip gets a dotted underline that brightens on hover. */
function LabelList({ items }: { items: LabelItem[] }) {
  return (
    <div className="truncate text-muted-foreground text-xs">
      {items.map(({ key, label, tooltip }, index) => (
        <Fragment key={key}>
          {index > 0 && <span className="text-faint-foreground">, </span>}
          <span
            className={cn(
              'cursor-default',
              tooltip && 'underline decoration-foreground/40 decoration-dotted underline-offset-3 hover:text-foreground hover:decoration-foreground',
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

  const extensionColumns: ColumnOrColumnGroup<GenOperationSummary>[] = extensions.map((ext) => ({
    key: ext.id,
    name: upperFirst(ext.key.replace('x-', '').replace(/-/g, ' ')),
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
    name: upperFirst(kind),
    hidden: hiddenTagKinds.has(kind),
    sortable: true,
    minBreakpoint: 'md',
    resizable: true,
    // A set width keeps the spare room for the path column
    width: plainTagKinds.has(kind) ? 90 : 130,
    minWidth: 80,
    placeholderValue: '-',
    renderCell: ({ row }: { row: GenOperationSummary }) => {
      const values = row.tagsByKind[kind];
      if (!values?.length) return null;
      if (plainTagKinds.has(kind)) return <LabelList items={values.map((tag) => ({ key: tag, label: tag }))} />;
      return <TagBadges values={values} />;
    },
  }));

  const columns: ColumnOrColumnGroup<GenOperationSummary>[] = [
    {
      key: 'method',
      name: t('c:method'),
      sortable: true,
      width: 80,
      minWidth: 80,
      renderCell: ({ row }) => <MethodLabel method={row.method} />,
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
          className="min-w-0 font-mono text-xs"
          onClick={(event) => openOperationSheet(row, event.currentTarget)}
        >
          {/* The underline sits on the path alone: on the button it would reach the badge too */}
          <span dir="rtl" className={cn(cellLinkTextClass, 'min-w-0 flex-1 text-left')}>
            &lrm;
            <HighlightText text={row.path} />
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
        if (!row.hasResponseBody) return <span className="w-full text-center text-muted-foreground text-xs">{t('c:not_applicable')}</span>;
        // Has response body but no example yet
        if (!row.hasExample) return <span className="w-full text-center text-muted-foreground">-</span>;
        return (
          <Button
            variant="cell"
            size="cell"
            tabIndex={tabIndex}
            className="justify-center opacity-60"
            aria-label={t('c:docs.view_example')}
            data-tooltip="true"
            data-tooltip-content={t('c:docs.view_example')}
            onClick={(event) => openExamplesSheet(row, event.currentTarget)}
          >
            <BirdIcon />
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
      renderCell: ({ row }) => <code className="truncate text-muted-foreground text-xs">{row.id}</code>,
    },
    {
      key: 'summary',
      name: t('c:summary'),
      hidden: true,
      sortable: true,
      resizable: true,
      minWidth: 200,
      renderCell: ({ row }) => (
        <span className="truncate text-sm">
          <HighlightText text={row.summary || row.id} />
        </span>
      ),
    },
    ...extensionColumns,
    mcpColumn,
    ...tagKindColumns,
  ];

  return useColumnVisibility(columns);
};
