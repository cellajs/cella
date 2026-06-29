import { PlusIcon, TrashIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from 'sdk';
import { appConfig } from 'shared';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { Export } from '~/modules/common/data-table/export';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { fetchPagesForExport } from '~/modules/page/query';
import type { PageTreeRow } from '~/modules/page/table/page-tree-config';
import type { PagesRouteSearchParams } from '~/modules/page/types';
import { useInfiniteQueryTotal } from '~/query/basic/use-infinite-query-total';
import { CreatePageForm } from '../create-page-form';
import { DeletePages } from '../delete-pages';

interface PagesTableBarProps extends BaseTableBarProps<PageTreeRow, PagesRouteSearchParams> {}

export const PagesTableBar = ({
  searchVars,
  setSearch,
  columns,
  setColumns,
  selected,
  clearSelection,
  queryKey,
}: PagesTableBarProps) => {
  const { t } = useTranslation();

  const removeDialog = useDialoger((state) => state.remove);
  const createDialog = useDialoger((state) => state.create);

  const createButtonRef = useRef(null);
  const deleteButtonRef = useRef(null);

  const total = useInfiniteQueryTotal(queryKey);

  const { q } = searchVars;

  const isFiltered = !!q;
  // Drop selected rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
    clearSelection();
  };

  const onCreatePage = () => {
    removeDialog('create-page');
  };

  const openDeleteDialog = () => {
    // Success toast is handled by collection's onDelete callback
    const callback = () => {
      clearSelection();
    };

    createDialog(<DeletePages pages={selected} callback={callback} isDialog />, {
      id: 'delete-pages',
      triggerRef: deleteButtonRef,
      className: 'max-w-xl',
      title: t('c:delete'),
      description: t('c:confirm.delete_counted_resource', {
        count: selected.length,
        resource: selected.length > 1 ? t('c:pages').toLowerCase() : t('c:page').toLowerCase(),
      }),
    });
  };

  const fetchExport = async (limit: number) => {
    return fetchPagesForExport({ limit, q });
  };

  return (
    <TableBarContainer searchVars={searchVars}>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 ? (
            <>
              <TableBarButton
                variant="destructive"
                label="c:remove"
                icon={TrashIcon}
                className="relative"
                badge={selected.length}
                onClick={openDeleteDialog}
              />
              <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquareIcon} label="c:clear" />
            </>
          ) : (
            !isFiltered && (
              <TableBarButton
                label="c:create"
                icon={PlusIcon}
                onClick={() => {
                  createDialog(<CreatePageForm callback={onCreatePage} />, {
                    id: 'create-page',
                    triggerRef: createButtonRef,
                    className: 'md:max-w-2xl',
                    title: t('c:create_resource', { resource: t('c:page').toLowerCase() }),
                    titleContent: (
                      <UnsavedBadge title={t('c:create_resource', { resource: t('c:page').toLowerCase() })} />
                    ),
                  });
                }}
              />
            )
          )}
          {selected.length === 0 && (
            <TableCount count={total} label="c:page" isFiltered={isFiltered} onResetFilters={onResetFilters} />
          )}
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarSearch>
          <TableSearch name="pageSearch" value={q} setQuery={onSearch} />
        </FilterBarSearch>
      </TableFilterBar>

      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
      <Export
        className="max-lg:hidden"
        filename={`${appConfig.slug}-pages`}
        columns={columns as ColumnOrColumnGroup<Page>[]}
        selectedRows={selected as Page[]}
        fetchRows={fetchExport}
      />
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
