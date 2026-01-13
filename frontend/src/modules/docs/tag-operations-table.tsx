import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { GenOperationSummary, TagName } from '~/api.gen/docs';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { DataTable } from '~/modules/common/data-table';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { Badge } from '~/modules/ui/badge';
import { getMethodColor } from './helpers/get-method-color';

interface TagOperationsTableProps {
  operations: GenOperationSummary[];
  tagName: TagName;
}

/**
 * Columns for TagOperationsTable
 */
const useColumns = (tagName: TagName): ColumnOrColumnGroup<GenOperationSummary>[] => {
  const isMobile = useBreakpoints('max', 'sm', false);
  const navigate = useNavigate();
  const { operationTag: activeTag } = useSearch({ from: '/publicLayout/docs/operations' });
  const { scrollToSection } = useScrollSpy({ smoothScroll: true });

  // Handle operation click necessary to expand tag if not already expanded
  const handleOperationClick = (hash: string) => {
    // If already expanded, just scroll
    if (activeTag === tagName) {
      scrollToSection(hash);
      return;
    }
    // Otherwise, navigate to expand then scroll
    navigate({
      to: '.',
      search: (prev) => ({ ...prev, operationTag: tagName }),
      hash,
      replace: true,
      resetScroll: false,
    });
    // Schedule scroll
    setTimeout(() => scrollToSection(hash), 350);
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
