import { Suspense, lazy, useRef, useState } from 'react';
import useSearchParams from '~/hooks/use-search-params';

import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useColumns } from '~/modules/organizations/invites/table/columns';
import { InvitesInfoHeader } from '~/modules/organizations/invites/table/table-header';
import type { BaseTableMethods, OrganizationInvitesInfo } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';

const BaseDataTable = lazy(() => import('~/modules/organizations/invites/table/table'));

export interface InvitesInfoProps {
  info: OrganizationInvitesInfo[];
}

export type InvitesInfoSearch = { q?: string; order?: 'asc' | 'desc'; sort: 'expiresAt' | 'createdAt' | 'createdBy' };

export const InvitesInfoTable = ({ info }: InvitesInfoProps) => {
  const { search, setSearch } = useSearchParams<InvitesInfoSearch>({ saveDataInSearch: false });

  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { q, sort, order } = search;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<OrganizationInvitesInfo[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: OrganizationInvitesInfo[], newTotal: number | undefined) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Build columns
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <InvitesInfoHeader
        total={total}
        selected={selected}
        columns={columns}
        q={q ?? ''}
        setSearch={setSearch}
        setColumns={setColumns}
        clearSelection={clearSelection}
      />
      <Suspense>
        <BaseDataTable
          ref={dataTableRef}
          info={info}
          columns={columns}
          queryVars={{ q, sort, order, limit: info.length }}
          updateCounts={updateCounts}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
        />
      </Suspense>
    </div>
  );
};

export default InvitesInfoTable;
