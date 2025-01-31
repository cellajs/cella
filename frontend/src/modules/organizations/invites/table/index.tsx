import type { config } from 'config';
import { Suspense, lazy, useRef, useState } from 'react';
import useSearchParams from '~/hooks/use-search-params';

import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { useColumns } from '~/modules/organizations/invites/table/columns';
import { InvitesHeader } from '~/modules/organizations/invites/table/table-header';
import type { OrganizationInvites } from '~/modules/organizations/types';

import { arraysHaveSameElements } from '~/utils';

const BaseDataTable = lazy(() => import('~/modules/organizations/invites/table/table'));

export interface InvitesProps {
  info: OrganizationInvites[];
}

export type InvitesSearch = {
  q?: string;
  order?: 'asc' | 'desc';
  sort: 'expiresAt' | 'createdAt' | 'createdBy';
  role?: (typeof config.rolesByType.entityRoles)[number];
};

export const InvitesTable = ({ info }: InvitesProps) => {
  const { search, setSearch } = useSearchParams<InvitesSearch>({ saveDataInSearch: false });

  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { q, role, sort, order } = search;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<OrganizationInvites[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: OrganizationInvites[], newTotal: number | undefined) => {
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
      <InvitesHeader
        total={total}
        selected={selected}
        columns={columns}
        q={q ?? ''}
        role={role}
        setSearch={setSearch}
        setColumns={setColumns}
        clearSelection={clearSelection}
      />
      <Suspense>
        <BaseDataTable
          ref={dataTableRef}
          info={info}
          columns={columns}
          queryVars={{ q, role, sort, order, limit: info.length }}
          updateCounts={updateCounts}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
        />
      </Suspense>
    </div>
  );
};

export default InvitesTable;
