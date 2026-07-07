import { Link } from '@tanstack/react-router';
import { GripVerticalIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditCellInput, enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { ExpandToggleColumn } from '~/modules/common/data-table/tree';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { docRenderModes } from '~/modules/page/content';
import type { PageTreeRow } from '~/modules/page/table/page-tree-config';
import { canEditDocs } from '~/modules/page/utils/edit-doc-page';
import { RenderModeLabel, renderModeLabelKey } from '~/modules/page/utils/render-mode';
import { Badge } from '~/modules/ui/badge';
import { dateShort } from '~/utils/date-short';

export const dragHandleColumnKey = 'drag-handle';

/** Published/draft is stored as the `draft` frontmatter boolean; the editor works over these labels. */
const publishStatuses = ['published', 'draft'] as const;
type PublishStatus = (typeof publishStatuses)[number];

/**
 * Builds column definitions for the pages table. The tree expand toggle pulls
 * its handler / row height / max depth from the surrounding `<TreeProvider>`
 * (set up in `pages-table.tsx`), so no per-column wiring is needed here.
 *
 * When {@link canEditDocs} (dev only), title / render mode / published status
 * are inline-editable and a drag handle enables reorder + reparent — edits are
 * written back to the md/mdx frontmatter by the dev server (vite/docs-editor.ts).
 * In production the columns render read-only.
 */
export function usePagesTableColumns() {
  const { t } = useTranslation();

  const configs: ColumnOrColumnGroup<PageTreeRow>[] = [
    ...(canEditDocs
      ? [
          {
            key: dragHandleColumnKey,
            name: '',
            width: 32,
            maxWidth: 32,
            cellClass: 'cursor-grab flex items-center justify-center',
            rowDragHandle: true,
            renderCell: () => <GripVerticalIcon size={14} className="text-muted-foreground/50" />,
          } satisfies ColumnOrColumnGroup<PageTreeRow>,
        ]
      : []),
    ExpandToggleColumn,
    {
      key: 'name',
      name: t('c:title'),
      minWidth: 180,
      resizable: true,
      renderCell: ({ row, tabIndex }) => (
        <div className="group flex items-center gap-2 truncate outline-0 ring-0">
          <Link
            to="/docs/page/$"
            tabIndex={tabIndex}
            draggable={false}
            params={{ _splat: row.id }}
            className="group flex min-w-0 items-center outline-0 ring-0"
          >
            <span className="truncate font-medium decoration-foreground/20 underline-offset-3 group-hover:underline group-active:translate-y-[.05rem] group-active:decoration-foreground/50">
              {row.name}
            </span>
          </Link>
          {row.draft && <Badge variant="secondary">{t('c:draft')}</Badge>}
          {row._hasChildren && !row._isExpanded && (
            <span
              className="shrink-0 text-muted-foreground/70 text-xs"
              data-tooltip="true"
              data-tooltip-content={t('c:child_page', { count: row._childCount })}
            >
              {row._childCount}
            </span>
          )}
        </div>
      ),
      ...(canEditDocs && {
        editable: true,
        renderEditCell: ({ row, onRowChange }) => (
          <EditCellInput value={row.name} onChange={(e) => onRowChange({ ...row, name: e.target.value })} autoFocus />
        ),
      }),
    },
    {
      key: 'id',
      name: t('c:path'),
      minBreakpoint: 'md',
      resizable: true,
      minWidth: 160,
      renderCell: ({ row }) => <span className="truncate font-mono text-muted-foreground text-xs">{row.id}</span>,
    },
    {
      key: 'status',
      name: t('c:status'),
      minBreakpoint: 'md',
      resizable: true,
      width: 140,
      renderCell: ({ row }) => (
        <Badge variant={row.draft ? 'secondary' : 'success'}>{t(`c:${row.draft ? 'draft' : 'published'}`)}</Badge>
      ),
      ...(canEditDocs && {
        editable: true,
        editorOptions: enumSelectEditorOptions,
        renderEditCell: (props) => (
          <RenderEnumSelect<PageTreeRow, PublishStatus>
            {...props}
            options={publishStatuses}
            currentValue={props.row.draft ? 'draft' : 'published'}
            setValue={(row, value) => ({ ...row, draft: value === 'draft' })}
            renderOption={(status) => t(`c:${status}`)}
          />
        ),
      }),
    },
    {
      key: 'renderMode',
      name: t('c:render_mode'),
      minBreakpoint: 'md',
      resizable: true,
      width: 140,
      renderCell: ({ row }) => <RenderModeLabel mode={row.renderMode} label={t(renderModeLabelKey(row.renderMode))} />,
      ...(canEditDocs && {
        editable: true,
        editorOptions: enumSelectEditorOptions,
        renderEditCell: (props) => (
          <RenderEnumSelect
            {...props}
            field="renderMode"
            options={docRenderModes}
            renderOption={(mode) => <RenderModeLabel mode={mode} label={t(renderModeLabelKey(mode))} />}
          />
        ),
      }),
    },
    {
      key: 'updatedAt',
      name: t('c:updated_at'),
      minBreakpoint: 'lg',
      resizable: true,
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => (row.updatedAt ? dateShort(row.updatedAt) : '-'),
    },
  ];

  const [columns, setColumns] = useState(configs);

  // Memoized so the array identity stays stable across renders. The DataGrid
  // passes this through to memoized Row/Cell; a fresh array each render would
  // defeat that memoization and re-render every visible row.
  return {
    columns,
    setColumns,
  };
}
