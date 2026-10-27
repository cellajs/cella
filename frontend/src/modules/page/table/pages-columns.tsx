import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EditCellInput, enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { cellLinkTextClass, dateColumn } from '~/modules/common/data-table/columns';
import { ExpandToggleColumn } from '~/modules/common/data-table/tree/expand-toggle-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { docRenderModes } from '~/modules/page/content';
import { useDocSize } from '~/modules/page/table/doc-sizes';
import type { PageTreeRow } from '~/modules/page/table/page-tree';
import { canEditDocs } from '~/modules/page/utils/edit-doc-page';
import { RenderModeLabel } from '~/modules/page/utils/render-mode-label';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** Published/draft is stored as the `draft` frontmatter boolean; the editor works over these labels. */
const publishStatuses = ['published', 'draft'] as const;
type PublishStatus = (typeof publishStatuses)[number];

/** Past this many words a page is a candidate for splitting into child pages. */
const splitWords = 3000;

function PageSizeCell({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const size = useDocSize(slug);
  if (!size) return null;

  const format = new Intl.NumberFormat(i18n.resolvedLanguage);
  const tooltip = { 'data-tooltip': 'true', 'data-tooltip-content': t('c:word_count', { count: size.words, words: format.format(size.words) }) };
  if (size.words > splitWords) {
    return (
      <Badge variant="warning" soft className="font-mono tabular-nums" {...tooltip}>
        {format.format(size.chars)}
      </Badge>
    );
  }
  return (
    <span className="font-mono text-muted-foreground text-xs tabular-nums" {...tooltip}>
      {format.format(size.chars)}
    </span>
  );
}

/** `reorder` is the grip column, built by the table from its current rows; null where pages are read-only. */
export const useColumns = (reorder: ColumnOrColumnGroup<PageTreeRow> | null) => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<PageTreeRow>[] = [
    ...(reorder ? [reorder] : []),
    ExpandToggleColumn,
    {
      key: 'name',
      name: t('c:title'),
      minWidth: 180,
      resizable: true,
      renderCell: ({ row, tabIndex }) => (
        <div className="flex items-center gap-2 truncate">
          <Button
            variant="cell"
            size="cell"
            className="w-auto min-w-0"
            render={<Link to="/docs/page/$" tabIndex={tabIndex} params={{ _splat: row.id }} />}
          >
            <span className={cn(cellLinkTextClass, 'font-medium')}>{row.name}</span>
          </Button>
          {row.draft && <Badge variant="secondary">{t('c:draft')}</Badge>}
          {row._hasChildren && !row._isExpanded && (
            <span
              className="shrink-0 text-muted-foreground text-xs"
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
          <EditCellInput value={row.name} onChange={(event) => onRowChange({ ...row, name: event.target.value })} autoFocus />
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
      renderCell: ({ row }) => <Badge variant={row.draft ? 'secondary' : 'success'}>{t(`c:${row.draft ? 'draft' : 'published'}`)}</Badge>,
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
      renderCell: ({ row }) => <RenderModeLabel mode={row.renderMode} />,
      ...(canEditDocs && {
        editable: true,
        editorOptions: enumSelectEditorOptions,
        renderEditCell: (props) => (
          <RenderEnumSelect {...props} field="renderMode" options={docRenderModes} renderOption={(mode) => <RenderModeLabel mode={mode} />} />
        ),
      }),
    },
    {
      key: 'size',
      name: t('c:size'),
      minBreakpoint: 'lg',
      resizable: true,
      width: 110,
      renderCell: ({ row }) => <PageSizeCell slug={row.id} />,
    },
    { ...dateColumn('updatedAt', { name: t('c:updated_at'), sortable: false, minBreakpoint: 'lg' }), resizable: true },
  ];

  return useColumnVisibility(columns);
};
