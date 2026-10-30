import { BirdIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GenExtensionDefinition, GenOperationSummary } from 'sdk/docs-types';
import { cellLinkTextClass } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { extensionLabel } from '~/modules/docs/helpers/extension-label';
import { upperFirst } from '~/modules/docs/helpers/upper-first';
import { AccessCell, type AccessValue } from '~/modules/docs/operations/access-explanation';
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

/** Comma-separated plain labels. */
function LabelList({ labels }: { labels: string[] }) {
  return <div className="truncate text-muted-foreground text-xs">{labels.join(', ')}</div>;
}

export const useColumns = (extensions: GenExtensionDefinition[] = [], tagKinds: string[] = []) => {
  const { t } = useTranslation();

  const extensionColumns: ColumnOrColumnGroup<GenOperationSummary>[] = extensions.map((ext) => ({
    key: ext.id,
    name: extensionLabel(ext),
    minBreakpoint: 'md',
    resizable: true,
    width: 150,
    minWidth: 120,
    placeholderValue: '-',
    renderCell: ({ row, tabIndex }: { row: GenOperationSummary; tabIndex: number }) => {
      const values = row.extensions[ext.id];
      if (!values?.length) return null;
      const items: AccessValue[] = values.map((value) => ({
        value,
        code: value,
        name: ext.values?.[value]?.name ?? value,
        description: ext.values?.[value]?.description,
        isGuard: ext.key === 'x-guard',
      }));
      return <AccessCell label={extensionLabel(ext)} items={items} tabIndex={tabIndex} />;
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
    renderCell: ({ row, tabIndex }) => {
      if (!row.tool) return null;
      const items: AccessValue[] = [
        { value: 'tool', name: t('c:docs.tool'), description: t('c:docs.tool_description.text', { description: row.tool.description }) },
      ];
      if (row.tool.approvalRequired) {
        items.push({ value: 'approval', name: t('c:docs.needs_approval'), description: t('c:docs.tool_approval.text') });
      }
      return <AccessCell label="MCP" items={items} tabIndex={tabIndex} />;
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
      if (plainTagKinds.has(kind)) return <LabelList labels={values} />;
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
          className="min-w-0 font-mono text-foreground text-xs"
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
        if (!row.hasResponseBody) {
          return (
            <span
              className="w-full text-center text-muted-foreground text-xs"
              data-tooltip="true"
              data-tooltip-content={t('c:docs.no_response_body')}
            >
              {t('c:not_applicable')}
            </span>
          );
        }
        if (!row.hasExample) {
          return (
            <span className="w-full text-center text-muted-foreground" data-tooltip="true" data-tooltip-content={t('c:docs.no_example_yet')}>
              -
            </span>
          );
        }
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
      renderCell: ({ row }) => (
        <code className="truncate text-muted-foreground text-xs">
          <HighlightText text={row.id} />
        </code>
      ),
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
