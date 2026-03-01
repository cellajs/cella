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
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { toaster } from '~/modules/common/toaster/service';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { CreateTenantForm } from '~/modules/tenants/create-tenant-form';
import { useTenantArchiveMutation } from '~/modules/tenants/query';
import type { TenantsRouteSearchParams } from '~/modules/tenants/search-params-schema';
import { useInfiniteQueryTotal } from '~/query/basic';

type TenantsTableBarProps = BaseTableBarProps<Tenant, TenantsRouteSearchParams>;

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

  const removeDialog = useDialoger((state) => state.remove);
  const createDialog = useDialoger((state) => state.create);

  const total = useInfiniteQueryTotal(queryKey);
  const archiveButtonRef = useRef(null);
  const createButtonRef = useRef(null);

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
        await archiveTenant({ path: { tenantId: tenant.id } });
      }
      toaster(t('common:success.archived_resource', { resource: t('common:tenants') }), 'success');
      clearSelection();
    } catch {
      toaster(t('common:error.archive_resources'), 'error');
    }
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
    <TableBarContainer searchVars={searchVars} offsetTop={40}>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 ? (
            <>
              <TableBarButton
                ref={archiveButtonRef}
                variant="destructive"
                label="common:archive"
                icon={ArchiveIcon}
                onClick={archiveSelected}
                badge={selected.length}
              />
              <TableBarButton variant="ghost" label="common:clear" icon={XSquareIcon} onClick={clearSelection} />
            </>
          ) : (
            !isFiltered && (
              <TableBarButton className="mr-1" label="common:create" icon={PlusIcon} onClick={openCreateDialog} />
            )
          )}
          {selected.length === 0 && (
            <TableCount count={total} label="common:tenant" isFiltered={isFiltered} onResetFilters={onResetFilters} />
          )}
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
