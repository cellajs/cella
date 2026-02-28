import { useSuspenseQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from '~/hooks/use-search-params';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { OperationsTableBar } from '~/modules/docs/operations/operations-table/operations-bar';
import { useColumns } from '~/modules/docs/operations/operations-table/operations-columns';
import { infoQueryOptions, operationsQueryOptions } from '~/modules/docs/query';
import type { GenOperationSummary } from '~/modules/docs/types';

/**
 * Update an operation field via the Vite openapi-editor plugin
 */
async function updateOperationField(operationId: string, field: 'summary' | 'description', value: string) {
  const response = await fetch('/__openapi-editor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId, field, value }),
  });
  return response.json();
}

function OperationsTable() {
  const { search, setSearch } = useSearchParams<{ q?: string; sort?: string; order?: 'asc' | 'desc' }>({
    from: '/publicLayout/docs/operations/table',
  });

  const q = search.q || '';

  // Sort state backed by URL search params
  const { sortColumns, setSortColumns } = useSortColumns(search.sort, search.order, setSearch);

  const [isCompact, setIsCompact] = useState(false);
  const [isEntityOnly, setIsEntityOnly] = useState(false);

  // Fetch info to get extension definitions
  const { data: info } = useSuspenseQuery(infoQueryOptions);
  const extensions = info.extensions;

  const [columns, setColumns] = useColumns(isCompact, extensions);

  // Fetch operations via React Query (reduces bundle size)
  const { data: operations } = useSuspenseQuery(operationsQueryOptions);

  // Local state for operations to enable editing
  const [localOperations, setLocalOperations] = useState<GenOperationSummary[]>(operations);

  // Sync local state when operations data changes
  useEffect(() => {
    setLocalOperations(operations);
  }, [operations]);

  // Filter operations based on search query (searches all text fields)
  // Multiple space-separated terms are treated as AND conditions
  const filteredOperations = useMemo(() => {
    let ops = localOperations;

    // Filter to entity-related operations only
    if (isEntityOnly) {
      ops = ops.filter((op) => op.entityType);
    }

    if (!q) return ops;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return ops;

    return ops.filter((op) => {
      // Check if a single term matches any field in the operation
      const matchesTerm = (term: string) =>
        op.summary.toLowerCase().includes(term) ||
        op.id.toLowerCase().includes(term) ||
        op.method.toLowerCase().includes(term) ||
        op.path.toLowerCase().includes(term) ||
        op.description?.toLowerCase().includes(term) ||
        op.tags?.some((tag) => tag.toLowerCase().includes(term)) ||
        // Search across all dynamic extensions
        Object.values(op.extensions).some((values) => values.some((value) => value.toLowerCase().includes(term)));

      // All terms must match (AND logic)
      return terms.every(matchesTerm);
    });
  }, [q, localOperations, isEntityOnly]);

  // Client-side sorting
  const sortedOperations = useMemo(() => {
    if (!sortColumns.length) return filteredOperations;

    const { columnKey, direction } = sortColumns[0];
    const modifier = direction === 'ASC' ? 1 : -1;

    return [...filteredOperations].sort((a, b) => {
      const aVal = String(a[columnKey as keyof GenOperationSummary] ?? '');
      const bVal = String(b[columnKey as keyof GenOperationSummary] ?? '');
      return aVal.localeCompare(bVal) * modifier;
    });
  }, [filteredOperations, sortColumns]);

  // Handle row changes for editable cells
  const onRowsChange = useCallback(
    (changedRows: GenOperationSummary[], { indexes, column }: RowsChangeData<GenOperationSummary>) => {
      if (column.key !== 'summary') return;

      for (const index of indexes) {
        const operation = changedRows[index];
        const originalOperation = filteredOperations[index];

        // Skip if value hasn't changed
        if (operation.summary === originalOperation.summary) continue;

        // Update local state immediately for responsive UI
        setLocalOperations((prev) =>
          prev.map((op) => (op.id === operation.id ? { ...op, summary: operation.summary } : op)),
        );

        // Send update to the Vite plugin (dev mode only)
        updateOperationField(operation.id, 'summary', operation.summary).catch((err) => {
          console.error('Failed to update operation summary:', err);
          // Revert on error
          setLocalOperations((prev) =>
            prev.map((op) => (op.id === operation.id ? { ...op, summary: originalOperation.summary } : op)),
          );
        });
      }
    },
    [filteredOperations],
  );

  return (
    <FocusViewContainer>
      <OperationsTableBar
        total={filteredOperations.length}
        searchVars={{ q }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        isCompact={isCompact}
        setIsCompact={setIsCompact}
        isEntityOnly={isEntityOnly}
        setIsEntityOnly={setIsEntityOnly}
      />
      <DataTable<GenOperationSummary>
        columns={columns.filter((column) => column.visible)}
        rows={sortedOperations}
        onRowsChange={onRowsChange}
        selectionMode="none"
        hasNextPage={false}
        rowKeyGetter={(row) => row.hash}
        isLoading={false}
        isFetching={false}
        limit={sortedOperations.length}
        isFiltered={!!q}
        rowHeight={42}
        enableVirtualization
        sortColumns={sortColumns}
        onSortColumnsChange={setSortColumns}
      />
    </FocusViewContainer>
  );
}

export default OperationsTable;
