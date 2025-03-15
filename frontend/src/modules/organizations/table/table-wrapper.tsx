import { config } from 'config';
import { useRef, useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { useColumns } from '~/modules/organizations/table/columns';
import BaseDataTable from '~/modules/organizations/table/table';
import { OrganizationsTableBar } from '~/modules/organizations/table/table-bar';
import type { Organization } from '~/modules/organizations/types';
import { OrganizationsTableRoute, type organizationsSearchSchema } from '~/routes/system';

const LIMIT = config.requestLimits.organizations;

export type OrganizationsSearch = z.infer<typeof organizationsSearchSchema>;

const OrganizationsTable = () => {
  const { search, setSearch } = useSearchParams<OrganizationsSearch>({ from: OrganizationsTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { sort, order } = search;
  const limit = LIMIT;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Organization[]>([]);

  // Build columns
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <OrganizationsTableBar
        total={total}
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
        searchVars={{ ...search, limit }}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setTotal={setTotal}
        setSelected={setSelected}
      />
    </div>
  );
};

export default OrganizationsTable;
