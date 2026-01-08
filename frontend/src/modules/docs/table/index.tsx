import { useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';
import { type OperationSummary, operations } from '~/api.gen/docs';
import useSearchParams from '~/hooks/use-search-params';
import { DataTable } from '~/modules/common/data-table';
import { OperationsTableBar } from '~/modules/docs/table/bar';
import { useColumns } from '~/modules/docs/table/columns';

const OperationsTable = () => {
  const { setSearch } = useSearchParams<{ q?: string }>({ from: '/publicLayout/docs/' });
  const { q = '' } = useSearch({ from: '/publicLayout/docs/' });

  const [columns, setColumns] = useColumns();

  // Filter operations based on search query
  const filteredOperations = useMemo(() => {
    if (!q) return operations;
    const lowerQ = q.toLowerCase();
    return operations.filter(
      (op) =>
        op.summary.toLowerCase().includes(lowerQ) ||
        op.id.toLowerCase().includes(lowerQ) ||
        op.method.toLowerCase().includes(lowerQ) ||
        op.path.toLowerCase().includes(lowerQ),
    );
  }, [q]);

  return (
    <div className="flex flex-col gap-2">
      <OperationsTableBar
        total={filteredOperations.length}
        q={q}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
      />
      <DataTable<OperationSummary>
        columns={columns.filter((column) => column.visible)}
        rows={filteredOperations}
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
