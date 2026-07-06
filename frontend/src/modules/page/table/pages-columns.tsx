import { Link } from '@tanstack/react-router';
import { CloudOffIcon, GripVerticalIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { zPage } from 'sdk/zod.gen';
import { env } from '~/env';
import { enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { ExpandToggleColumn } from '~/modules/common/data-table/tree';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { PageTreeRow } from '~/modules/page/table/page-tree-config';
import { RenderModeLabel, renderModeLabelKey } from '~/modules/page/utils/render-mode';
import { Badge } from '~/modules/ui/badge';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

const pageStatuses = zPage.shape.status.options;
const pageRenderModes = zPage.shape.renderMode.options;

export const dragHandleColumnKey = 'drag-handle';

/** Check if a page is local-only (not yet synced to server) */
function isLocalPage(page: PageTreeRow) {
  return '_optimistic' in page;
}

/**
 * Builds column definitions for the pages table. The tree expand toggle
 * pulls its handler / row height / max depth from the surrounding
 * `<TreeProvider>` (set up in `pages-table.tsx`), so no per-column wiring
 * is needed here.
 */
export function usePagesTableColumns() {
  const { t } = useTranslation();

  const configs: ColumnOrColumnGroup<PageTreeRow>[] = [
    {
      key: dragHandleColumnKey,
      name: '',
      width: 32,
      maxWidth: 32,
      cellClass: 'cursor-grab flex items-center justify-center',
      rowDragHandle: true,
      renderCell: () => <GripVerticalIcon size={14} className="text-muted-foreground/50" />,
    },
    CheckboxColumn,
    ExpandToggleColumn,
    {
      key: 'name',
      name: t('c:title'),
      minWidth: 180,
      resizable: true,
      renderCell: ({ row, tabIndex }) => (
        <div className="group flex items-center truncate outline-0 ring-0">
          <Link
            to="/docs/page/$id"
            tabIndex={tabIndex}
            draggable={false}
            params={{ id: row.id }}
            className="group flex min-w-0 items-center outline-0 ring-0"
          >
            <span className="truncate font-medium decoration-foreground/20 underline-offset-3 group-hover:underline group-active:translate-y-[.05rem] group-active:decoration-foreground/50">
              {row.name}
            </span>
            {isLocalPage(row) && (
              <CloudOffIcon
                size={12}
                className="ml-1.5 shrink-0 text-muted-foreground/70"
                data-tooltip="true"
                data-tooltip-content={t('c:local_only')}
              />
            )}
          </Link>
          {env.VITE_DEBUG_MODE && <span className="ml-2 shrink-0 text-muted">#{row.displayOrder}</span>}
        </div>
      ),
    },
    {
      key: 'status',
      name: t('c:status'),
      editable: true,
      editorOptions: enumSelectEditorOptions,
      resizable: true,
      width: 160,
      renderCell: ({ row }) => {
        const variant = row.status === 'published' ? 'success' : row.status === 'unpublished' ? 'secondary' : 'warning';
        return <Badge variant={variant}>{t(`c:${row.status}`)}</Badge>;
      },
      renderEditCell: (props) => (
        <RenderEnumSelect
          {...props}
          field="status"
          options={pageStatuses}
          renderOption={(status) => t(`c:${status}`)}
        />
      ),
    },
    {
      key: 'renderMode',
      name: t('c:render_mode'),
      editable: true,
      editorOptions: enumSelectEditorOptions,
      minBreakpoint: 'md',
      resizable: true,
      width: 140,
      renderCell: ({ row }) => <RenderModeLabel mode={row.renderMode} label={t(renderModeLabelKey(row.renderMode))} />,
      renderEditCell: (props) => (
        <RenderEnumSelect
          {...props}
          field="renderMode"
          options={pageRenderModes}
          renderOption={(mode) => <RenderModeLabel mode={mode} label={t(renderModeLabelKey(mode))} />}
        />
      ),
    },
    {
      key: 'createdBy',
      name: t('c:created_by'),
      minBreakpoint: 'md',
      resizable: true,
      minWidth: 160,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) =>
        row.createdBy && <UserCell readOnly compactable user={row.createdBy} tabIndex={tabIndex} />,
    },
    {
      key: 'createdAt',
      name: t('c:created_at'),
      minBreakpoint: 'md',
      resizable: true,
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.createdAt),
    },
  ];

  const [columns, setColumns] = useState(configs);

  // Memoized so the array identity stays stable across renders. The DataGrid
  // passes this through to memoized Row/Cell; a fresh `.filter()` array each
  // render would defeat that memoization and re-render every visible row on
  // anything that triggers a parent re-render (e.g. checkbox selection).
  return {
    columns,
    setColumns,
  };
}
