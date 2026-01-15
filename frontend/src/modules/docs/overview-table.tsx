import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '~/modules/common/data-table';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { infoQueryOptions } from '~/modules/docs/query';
import { Card, CardContent } from '~/modules/ui/card';

interface InfoRow {
  key: string;
  label: string;
  value: string;
}

/**
 * Displays API overview information in a table format.
 * Shows title, version, and description from the OpenAPI info.
 */
const OverviewTable = () => {
  const { t } = useTranslation();

  // Fetch info via React Query (reduces bundle size)
  const { data: info } = useSuspenseQuery(infoQueryOptions);

  // Transform info object into rows for the table
  const rows: InfoRow[] = useMemo(
    () => [
      { key: 'title', label: t('common:title'), value: info.title },
      { key: 'version', label: t('common:version'), value: info.version },
      { key: 'description', label: t('common:description'), value: info.description },
      { key: 'openapiVersion', label: t('common:docs.openapi_version'), value: info.openapiVersion },
    ],
    [t],
  );

  const columns: ColumnOrColumnGroup<InfoRow>[] = useMemo(
    () => [
      {
        key: 'label',
        name: '',
        visible: true,
        sortable: false,
        resizable: false,
        width: 160,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <span className="font-medium">{row.label}</span>,
      },
      {
        key: 'value',
        name: '',
        visible: true,
        sortable: false,
        resizable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <div className="whitespace-pre-line leading-5 py-3 text-muted-foreground">{row.value}</div>
        ),
      },
    ],
    [],
  );

  return (
    <Card className="mb-12 border-0">
      <CardContent className="rdg-readonly">
        <DataTable<InfoRow>
          className="mb-0 pb-0 border-b"
          hideHeader
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
      </CardContent>
    </Card>
  );
};

export default OverviewTable;
