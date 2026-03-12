import type { QueryKey } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tenant } from '~/api.gen';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { CreateTenantForm } from '~/modules/tenants/create-tenant-form';
import type { TenantsRouteSearchParams } from '~/modules/tenants/search-params-schema';
import { useInfiniteQueryTotal } from '~/query/basic/use-infinite-query-total';

interface TenantsTableBarProps {
  queryKey: QueryKey;
  columns: ColumnOrColumnGroup<Tenant>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Tenant>[]>>;
  searchVars: TenantsRouteSearchParams & { limit: number };
  setSearch: (newValues: Partial<TenantsRouteSearchParams>, saveSearch?: boolean) => void;
}

export const TenantsTableBar = ({ queryKey, searchVars, setSearch, columns, setColumns }: TenantsTableBarProps) => {
  const { t } = useTranslation();

  const removeDialog = useDialoger((state) => state.remove);
  const createDialog = useDialoger((state) => state.create);

  const total = useInfiniteQueryTotal(queryKey);
  const createButtonRef = useRef(null);

  const { q } = searchVars;
  const isFiltered = !!q;

  const onSearch = (searchString: string) => {
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
  };

  const openCreateDialog = () => {
    createDialog(
      <CreateTenantForm
        callback={() => {
          removeDialog('create-tenant');
        }}
      />,
      {
        id: 'create-tenant',
        triggerRef: createButtonRef,
        className: 'md:max-w-xl',
        title: t('common:create_resource', { resource: t('common:tenant').toLowerCase() }),
        titleContent: (
          <UnsavedBadge title={t('common:create_resource', { resource: t('common:tenant').toLowerCase() })} />
        ),
      },
    );
  };

  return (
    <TableBarContainer searchVars={searchVars} offsetTop={48}>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {!isFiltered && (
            <TableBarButton className="mr-1" label="common:create" icon={PlusIcon} onClick={openCreateDialog} />
          )}
          <TableCount count={total} label="common:tenant" isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarSearch>
          <TableSearch name="tenant-search" value={q} setQuery={onSearch} />
        </FilterBarSearch>
      </TableFilterBar>

      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
