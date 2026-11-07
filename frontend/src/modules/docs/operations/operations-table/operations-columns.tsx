import { Link } from '@tanstack/react-router';
import { BirdIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GenExtensionDefinition, GenOperationSummary } from 'sdk/docs-types';
import { cellLinkTextClass } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { extensionLabel, extensionValue } from '~/modules/docs/helpers/extension-value';
import { operationLinkOptions } from '~/modules/docs/helpers/reference-links';
import { upperFirst } from '~/modules/docs/helpers/upper-first';
import { AccessCell, type AccessValue } from '~/modules/docs/operations/access-explanation';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import { openOperationSheet } from '~/modules/docs/operations/operation-detail';
import { openExamplesSheet } from '~/modules/docs/operations/operation-examples';
import { SwitchedOffBadge } from '~/modules/docs/operations/switched-off-badge';
import { TagBadges } from '~/modules/docs/tag-table';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { isModifiedClick } from '~/utils/is-modified-click';

/** Tag kinds whose columns start hidden, to keep the default table narrow; the columns menu shows them. */
const hiddenTagKinds = new Set(['owner', 'entity']);

/** Extensions that decide whether a request gets through: their values read as content, the others as support. */
const prominentExtensions = new Set(['x-guard', 'x-rate-limiter']);

export const useColumns = (extensions: GenExtensionDefinition[] = [], tagKinds: string[] = []) => {
  const { t, i18n } = useTranslation();

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
      const items = values.map((value) => extensionValue(ext, value, t, i18n.resolvedLanguage));
      return (
        <AccessCell
          label={extensionLabel(ext)}
          items={items}
          tabIndex={tabIndex}
          className={cn(prominentExtensions.has(ext.key) && 'text-foreground')}
        />
      );
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
      if (row.tool.approvalRequired) items.push({ value: 'approval', name: t('c:docs.needs_approval'), description: t('c:docs.tool_approval.text') });
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
    width: kind === 'owner' ? 90 : 130,
    minWidth: 80,
    placeholderValue: '-',
    renderCell: ({ row }: { row: GenOperationSummary }) => {
      const values = row.tagsByKind[kind];
      return values?.length ? <TagBadges kind={kind} values={values} /> : null;
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
          title={row.path}
          className="text-foreground min-w-0 font-mono text-xs"
          render={
            <Link
              {...operationLinkOptions(row)}
              tabIndex={tabIndex}
              onClick={(event) => {
                if (isModifiedClick(event)) return;
                event.preventDefault();
                openOperationSheet(row, event.currentTarget);
              }}
            />
          }
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
              className="text-muted-foreground w-full text-center text-xs"
              data-tooltip="true"
              data-tooltip-content={t('c:docs.no_response_body')}
            >
              {t('c:not_applicable')}
            </span>
          );
        }
        if (!row.hasExample) {
          return (
            <span className="text-muted-foreground w-full text-center" data-tooltip="true" data-tooltip-content={t('c:docs.no_example_yet')}>
              -
            </span>
          );
        }
        return (
          <Button
            variant="cell"
            size="cell"
            tabIndex={tabIndex}
            className="justify-center"
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
        <code className="text-muted-foreground truncate text-xs">
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
