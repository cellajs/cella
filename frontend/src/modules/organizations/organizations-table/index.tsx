import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import type { z } from 'zod';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import type { getOrganizationsQuerySchema } from '#/modules/organizations/schema';

import { useSearch } from '@tanstack/react-router';
import { config } from 'config';
import type { SortColumn } from 'react-data-grid';
import { getOrganizations } from '~/api/organizations';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import { OrganizationsTableRoute } from '~/routes/system';
import type { BaseTableMethods } from '~/types/common';
import { useColumns } from './columns';
import { OrganizationsTableHeader } from './table-header';

const BaseOrganizationsTable = lazy(() => import('~/modules/organizations/organizations-table/table'));
const LIMIT = config.requestLimits.organizations;

export type OrganizationsSearch = z.infer<typeof getOrganizationsQuerySchema>;
export type OrganizationsTableMethods = BaseTableMethods & {
  openNewsletterSheet: () => void;
};

const OrganizationsTable = () => {
  const search = useSearch({ from: OrganizationsTableRoute.id });

  // Table state
  const [q, setQuery] = useState<OrganizationsSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const sort = sortColumns[0]?.columnKey as OrganizationsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as OrganizationsSearch['order'];
  const limit = LIMIT;

  // Save filters in search params
  const filters = useMemo(() => ({ q, sort, order }), [q, sortColumns]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  const tableId = 'organizations-table';
  const dataTableRef = useRef<OrganizationsTableMethods | null>(null);
  const mutateQuery = useMutateQueryData(['organizations', 'list']);

  // Build columns
  const [columns, setColumns] = useColumns(mutateQuery.update);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openRemoveDialog();
  };

  const openNewsletterSheet = () => {
    if (dataTableRef.current) dataTableRef.current.openNewsletterSheet();
  };

  const fetchExport = async (limit: number) => {
    const { items } = await getOrganizations({ limit, q, sort: search.sort, order: search.order });
    return items;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <OrganizationsTableHeader
        tableId={tableId}
        columns={columns}
        q={q ?? ''}
        setQuery={setQuery}
        setColumns={setColumns}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openNewsletterSheet={openNewsletterSheet}
        fetchExport={fetchExport}
      />
      <Suspense>
        <BaseOrganizationsTable
          ref={dataTableRef}
          tableId={tableId}
          columns={columns}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
          queryVars={{
            q,
            sort,
            order,
            limit,
          }}
        />
      </Suspense>
    </div>
  );
};

export default OrganizationsTable;
