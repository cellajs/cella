import { useMemo } from 'react';
import { info } from '~/api.gen/docs';
import { DataTable } from '~/modules/common/data-table';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';

interface InfoRow {
  key: string;
  value: string;
}

const OverviewTable = () => {
  // Transform info object into rows for the table
  const rows: InfoRow[] = useMemo(
    () => [
      { key: 'Title', value: info.title },
      { key: 'Version', value: info.version },
      { key: 'Description', value: info.description },
      { key: 'OpenAPI Version', value: info.openapiVersion },
    ],
    [],
  );

  const columns: ColumnOrColumnGroup<InfoRow>[] = useMemo(
    () => [
      {
        key: 'key',
        name: '',
        visible: true,
        sortable: false,
        resizable: false,
        width: 160,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <span className="font-medium">{row.key}</span>,
      },
      {
        key: 'value',
        name: '',
        visible: true,
        sortable: false,
        resizable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <span className="text-muted-foreground">{row.value}</span>,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-medium px-1">API Overview</h2>
      <DataTable<InfoRow>
        columns={columns}
        rows={rows}
        hasNextPage={false}
        rowKeyGetter={(row) => row.key}
        isLoading={false}
        isFetching={false}
        limit={rows.length}
        isFiltered={false}
        rowHeight={42}
        enableVirtualization={false}
      />
    </div>
  );
};

export default OverviewTable;
