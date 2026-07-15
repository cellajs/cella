import { Link, useNavigate } from '@tanstack/react-router';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { DataTable } from '~/modules/common/data-table/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { GenOperationSummary } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';
import { getMethodColor } from './helpers/get-method-color';

interface TagOperationsTableProps {
  operations: GenOperationSummary[];
  tagName: string;
  /** Called on hover/focus to trigger prerendering of this tag's details */
  onPrerender?: () => void;
}

/**
 * Columns for TagOperationsTable
 */
function useColumns(tagName: string): ColumnOrColumnGroup<GenOperationSummary>[] {
  const navigate = useNavigate();

  // Enqueue scroll (store retries until the target is laid out), then navigate. The <Link>'s
  // default nav covers keyboard/middle-click; this path queues the scroll before nav re-renders.
  const handleOperationClick = (hash: string) => {
    scrollToSectionById(hash);
    navigate({
      to: '.',
      search: (prev) => ({ ...prev, operationTag: tagName }),
      hash,
      replace: true,
      resetScroll: false,
    });
  };

  return [
    {
      key: 'method',
      name: '',

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
      name: '',
      minWidth: 200,

      renderCell: ({ row, tabIndex }) => (
        <Link
          to="."
          search={(prev) => ({ ...prev, operationTag: tagName })}
          hash={row.hash}
          replace
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            handleOperationClick(row.hash);
          }}
          resetScroll={false}
          draggable={false}
          tabIndex={tabIndex}
          title={row.path}
          dir="rtl"
          className="truncate text-left font-mono text-sm decoration-foreground/30 underline-offset-3 hover:underline"
        >
          &lrm;{row.path}
        </Link>
      ),
    },
    {
      key: 'id',
      name: '',
      minBreakpoint: 'md',

      width: 200,
      renderCell: ({ row }) => <code className="truncate font-mono text-muted-foreground text-xs">{row.id}</code>,
    },
  ];
}

/**
 * Simple read-only operations table for displaying operations within a tag section
 */
export const TagOperationsTable = ({ operations, tagName, onPrerender }: TagOperationsTableProps) => {
  const columns = useColumns(tagName);

  return (
    <div onMouseEnter={onPrerender} onFocus={onPrerender}>
      <DataTable<GenOperationSummary>
        className="mb-0"
        columns={columns}
        rows={operations}
        hasNextPage={false}
        rowKeyGetter={(row) => row.hash}
        isLoading={false}
        isFetching={false}
        limit={operations.length}
        isFiltered={false}
        rowHeight={36}
        hideHeader
        enableVirtualization={false}
        readOnly
      />
    </div>
  );
};
