import { Link } from '@tanstack/react-router';
import type { GenOperationSummary, TagName } from '~/api.gen/docs';
import { DataTable } from '~/modules/common/data-table';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { Badge } from '~/modules/ui/badge';
import { getMethodColor } from './helpers/get-method-color';

interface TagOperationsTableProps {
  operations: GenOperationSummary[];
  tagName: TagName;
}

const useColumns = (tagName: TagName): ColumnOrColumnGroup<GenOperationSummary>[] => [
  {
    key: 'method',
    name: '',
    sortable: false,
    width: 80,
    renderHeaderCell: HeaderCell,
    renderCell: ({ row }) => (
      <Badge
        variant="secondary"
        className={`font-mono uppercase text-xs bg-transparent shadow-none ${getMethodColor(row.method)}`}
      >
        {row.method.toUpperCase()}
      </Badge>
    ),
  },
  {
    key: 'path',
    name: '',
    minWidth: 200,
    sortable: false,
    renderHeaderCell: HeaderCell,
    renderCell: ({ row, tabIndex }) => (
      <Link
        to="."
        search={(prev) => ({ ...prev, tag: tagName })}
        hash={row.hash}
        replace
        resetScroll={false}
        draggable={false}
        tabIndex={tabIndex}
        className="font-mono text-sm truncate hover:underline underline-offset-3 decoration-foreground/30"
      >
        {row.path}
      </Link>
    ),
  },
  {
    key: 'id',
    name: '',
    sortable: false,
    width: 180,
    renderHeaderCell: HeaderCell,
    renderCell: ({ row }) => <code className="text-xs text-muted-foreground font-mono">{row.id}</code>,
  },
];

/**
 * Simple read-only operations table for displaying operations within a tag section
 */
export const TagOperationsTable = ({ operations, tagName }: TagOperationsTableProps) => {
  const columns = useColumns(tagName);

  return (
    <DataTable<GenOperationSummary>
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
    />
  );
};
