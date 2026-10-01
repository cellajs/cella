import type { Dispatch, SetStateAction } from 'react';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { PageTreeRow } from '~/modules/page/table/page-tree-config';
import type { PagesRouteSearchParams } from '~/modules/page/types';

interface PagesTableBarProps {
  total: number;
  searchVars: PagesRouteSearchParams;
  setSearch: (search: PagesRouteSearchParams) => void;
  columns: ColumnOrColumnGroup<PageTreeRow>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<PageTreeRow>[]>>;
}

export function PagesTableBar({ total, searchVars, setSearch, columns, setColumns }: PagesTableBarProps) {
  const barFilters = useTableBarFilters({ searchVars, setSearch, reset: { q: '' } });

  return <TableBarShell {...barFilters} {...{ searchVars, total, columns, setColumns }} label="c:page" searchName="pageSearch" />;
}
