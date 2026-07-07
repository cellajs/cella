import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExpandToggleColumn } from '~/modules/common/data-table/tree';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { PageTreeRow } from '~/modules/page/table/page-tree-config';
import { RenderModeLabel, renderModeLabelKey } from '~/modules/page/utils/render-mode';
import { Badge } from '~/modules/ui/badge';
import { dateShort } from '~/utils/date-short';

/**
 * Builds column definitions for the (read-only) pages table. The tree expand
 * toggle pulls its handler / row height / max depth from the surrounding
 * `<TreeProvider>` (set up in `pages-table.tsx`), so no per-column wiring
 * is needed here. Content changes happen by editing the md/mdx files in
 * `src/content/docs`, not through the table.
 */
export function usePagesTableColumns() {
  const { t } = useTranslation();

  const configs: ColumnOrColumnGroup<PageTreeRow>[] = [
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
        </div>
      ),
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
      key: 'renderMode',
      name: t('c:render_mode'),
      minBreakpoint: 'md',
      resizable: true,
      width: 140,
      renderCell: ({ row }) => <RenderModeLabel mode={row.renderMode} label={t(renderModeLabelKey(row.renderMode))} />,
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
  // passes this through to memoized Row/Cell; a fresh `.filter()` array each
  // render would defeat that memoization and re-render every visible row on
  // anything that triggers a parent re-render.
  return {
    columns,
    setColumns,
  };
}
