import { Link, useNavigate } from '@tanstack/react-router';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { DataTable } from '~/modules/common/data-table';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { GenOperationSummary } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';
import { getMethodColor } from './helpers/get-method-color';

interface TagOperationsTableProps {
  operations: GenOperationSummary[];
  tagName: string;
}

/**
 * Columns for TagOperationsTable
 */
const useColumns = (tagName: string): ColumnOrColumnGroup<GenOperationSummary>[] => {
  const isMobile = useBreakpoints('max', 'sm', false);
  const navigate = useNavigate();
  const { scrollToSection } = useScrollSpy({ smoothScroll: true });

  // Handle operation click necessary to expand tag if not already expanded
  const handleOperationClick = (hash: string) => {
    navigate({
      to: '.',
      search: (prev) => ({ ...prev, operationTag: tagName }),
      hash,
      replace: true,
      resetScroll: false,
    }).finally(() => {
      setTimeout(() => scrollToSection(hash), 50);
    });
  };

  return [
    {
      key: 'method',
      name: '',
      visible: true,
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
      visible: true,
      minWidth: 200,
      sortable: false,
      renderHeaderCell: HeaderCell,
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
          className="font-mono text-sm truncate hover:underline underline-offset-3 decoration-foreground/30"
        >
          {row.path}
        </Link>
      ),
    },
    {
      key: 'id',
      name: '',
      visible: !isMobile,
      sortable: false,
      width: 200,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <code className="text-xs truncate text-muted-foreground font-mono">{row.id}</code>,
    },
  ];
};

/**
 * Simple read-only operations table for displaying operations within a tag section
 */
export const TagOperationsTable = ({ operations, tagName }: TagOperationsTableProps) => {
  const columns = useColumns(tagName);

  return (
    <DataTable<GenOperationSummary>
      className="mb-0"
      columns={columns.filter((col) => col.visible)}
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
