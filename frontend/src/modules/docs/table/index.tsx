import { useSearch } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { type GenOperationSummary, operations } from '~/api.gen/docs';
import useSearchParams from '~/hooks/use-search-params';
import { DataTable } from '~/modules/common/data-table';
import { OperationsTableBar } from '~/modules/docs/table/bar';
import { useColumns } from '~/modules/docs/table/columns';

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

const OperationsTable = () => {
  const { setSearch } = useSearchParams<{ q?: string }>({ from: '/publicLayout/docs/' });
  const { q = '' } = useSearch({ from: '/publicLayout/docs/' });

  const [columns, setColumns] = useColumns();

  // Local state for operations to enable editing
  const [localOperations, setLocalOperations] = useState<GenOperationSummary[]>(operations);

  // Filter operations based on search query
  const filteredOperations = useMemo(() => {
    if (!q) return localOperations;
    const lowerQ = q.toLowerCase();
    return localOperations.filter(
      (op) =>
        op.summary.toLowerCase().includes(lowerQ) ||
        op.id.toLowerCase().includes(lowerQ) ||
        op.method.toLowerCase().includes(lowerQ) ||
        op.path.toLowerCase().includes(lowerQ),
    );
  }, [q, localOperations]);

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
    <div className="flex flex-col gap-2">
      <OperationsTableBar
        total={filteredOperations.length}
        q={q}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
      />
      <DataTable<GenOperationSummary>
        columns={columns.filter((column) => column.visible)}
        rows={filteredOperations}
        onRowsChange={onRowsChange}
        hasNextPage={false}
        rowKeyGetter={(row) => row.hash}
        isLoading={false}
        isFetching={false}
        limit={filteredOperations.length}
        isFiltered={!!q}
        rowHeight={42}
        enableVirtualization={false}
      />
    </div>
  );
};

export default OperationsTable;
