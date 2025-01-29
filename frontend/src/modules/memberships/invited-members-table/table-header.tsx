import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableHeaderContainer } from '~/modules/common/data-table/table-header-container';
import TableSearch from '~/modules/common/data-table/table-search';
import SelectRole from '~/modules/common/form-fields/select-role';
import type { BaseTableHeaderProps, BaseTableMethods, InvitedMemberInfo } from '~/types/common';
import type { InvitesInfoSearch } from '.';

type InvitesInfoTableHeaderProps = BaseTableMethods &
  BaseTableHeaderProps<InvitedMemberInfo, InvitesInfoSearch> & { role: InvitesInfoSearch['role'] };

export const InvitesInfoHeader = ({ total, q, role, setSearch, clearSelection }: InvitesInfoTableHeaderProps) => {
  const isFiltered = !!q || !!role;

  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };
  // Drop selected Rows on role change
  const onRoleChange = (role?: string) => {
    clearSelection();
    setSearch({ role: role === 'all' ? undefined : (role as InvitesInfoSearch['role']) });
  };

  const onResetFilters = () => {
    setSearch({ q: '', role: undefined });
    clearSelection();
  };

  return (
    <TableHeaderContainer>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          <TableCount count={total} type="invite" isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarContent>
          <SelectRole value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" entity />
          <TableSearch value={q} setQuery={onSearch} />
        </FilterBarContent>
      </TableFilterBar>
    </TableHeaderContainer>
  );
};
