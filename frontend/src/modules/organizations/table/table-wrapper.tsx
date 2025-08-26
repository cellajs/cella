import { appConfig } from 'config';
import { useRef, useState } from 'react';
import type { z } from 'zod';
import type { zGetOrganizationsResponse } from '~/api.gen/zod.gen';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { organizationsQueryOptions } from '~/modules/organizations/query';
import { useColumns } from '~/modules/organizations/table/columns';
import BaseDataTable from '~/modules/organizations/table/table';
import { OrganizationsTableBar } from '~/modules/organizations/table/table-bar';
import { OrganizationsTableRoute, type organizationsSearchSchema } from '~/routes/system';

const LIMIT = appConfig.requestLimits.organizations;

export type OrganizationsSearch = z.infer<typeof organizationsSearchSchema>;
export type OrganizationTable = z.infer<typeof zGetOrganizationsResponse>['items'][number];

const OrganizationsTable = () => {
  const { search, setSearch } = useSearchParams<OrganizationsSearch>({ from: OrganizationsTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { sort, order } = search;
  const limit = LIMIT;

  const queryOptions = organizationsQueryOptions({ ...search, limit });

  // State for selected
  const [selected, setSelected] = useState<OrganizationTable[]>([]);

  // Build columns
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <OrganizationsTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        columns={columns}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        setColumns={setColumns}
        clearSelection={clearSelection}
      />
      <BaseDataTable
        ref={dataTableRef}
        columns={columns}
        queryOptions={queryOptions}
        searchVars={{ ...search, limit }}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setSelected={setSelected}
      />
    </div>
  );
};

export default OrganizationsTable;
