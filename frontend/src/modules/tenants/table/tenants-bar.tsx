import { ArchiveIcon, PlusIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tenant } from '~/api.gen';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster/service';
import { useTenantArchiveMutation } from '~/modules/tenants/query';
import type { TenantsRouteSearchParams } from '~/modules/tenants/search-params-schema';
import { useInfiniteQueryTotal } from '~/query/basic';

type TenantsTableBarProps = BaseTableBarProps<Tenant, TenantsRouteSearchParams>;

// TODO-036 tenants table bar is somehow not on a single line. search input takes a second line. Check with other bars
export const TenantsTableBar = ({
  selected,
  queryKey,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
}: TenantsTableBarProps) => {
  const { t } = useTranslation();

  const total = useInfiniteQueryTotal(queryKey);
  const archiveButtonRef = useRef(null);

  const { q } = searchVars;
  const isFiltered = !!q;

  const { mutateAsync: archiveTenant } = useTenantArchiveMutation();

  // Drop selected rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
    clearSelection();
  };

  const archiveSelected = async () => {
    const activeSelected = selected.filter((t) => t.status !== 'archived');
    if (activeSelected.length === 0) return;

    try {
      for (const tenant of activeSelected) {
        await archiveTenant({ tenantId: tenant.id });
      }
      toaster(t('common:success.archived_resource', { resource: t('common:tenants') }), 'success');
      clearSelection();
    } catch {
      toaster(t('common:error.archive_resources'), 'error');
    }
  };

  const openCreateDialog = () => {
    // TODO-014: Implement tenant creation dialog
    toaster('Create tenant dialog not implemented yet', 'info');
  };

  return (
    <>
      {/* Table count and actions */}
      <TableBarContainer>
        <TableCount count={total} label="common:tenant_other" isFiltered={isFiltered} onResetFilters={onResetFilters} />
        <div className="flex flex-row items-center gap-2">
          <TableBarButton className="mr-1" label="common:create" icon={PlusIcon} onClick={openCreateDialog} />
          <ColumnsView columns={columns} setColumns={setColumns} />
        </div>
      </TableBarContainer>

      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters}>
        <FilterBarSearch>
          <TableSearch name="tenant-search" value={q} setQuery={onSearch} />
        </FilterBarSearch>
        <FilterBarActions>
          {selected.length > 0 && (
            <>
              <TableBarButton
                ref={archiveButtonRef}
                variant="destructive"
                label="common:archive"
                icon={ArchiveIcon}
                onClick={archiveSelected}
              />
              <TableBarButton label="common:clear" icon={XSquareIcon} onClick={clearSelection} />
            </>
          )}
        </FilterBarActions>
      </TableFilterBar>
    </>
  );
};
