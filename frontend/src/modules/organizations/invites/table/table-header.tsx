import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableHeaderContainer } from '~/modules/common/data-table/table-header-container';
import TableSearch from '~/modules/common/data-table/table-search';
import type { InvitesInfoSearch } from '~/modules/organizations/invites/table';
import type { BaseTableHeaderProps, BaseTableMethods, OrganizationInvitesInfo } from '~/types/common';

type InvitesInfoTableHeaderProps = BaseTableMethods & BaseTableHeaderProps<OrganizationInvitesInfo, InvitesInfoSearch>;

export const InvitesInfoHeader = ({ total, q, setSearch, clearSelection }: InvitesInfoTableHeaderProps) => {
  const isFiltered = !!q;
  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
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
          <TableSearch value={q} setQuery={onSearch} />
        </FilterBarContent>
      </TableFilterBar>
    </TableHeaderContainer>
  );
};
