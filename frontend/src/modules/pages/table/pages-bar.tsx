import { appConfig } from 'config';
import { PlusIcon, TrashIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getPages, type Page } from '~/api.gen';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import type { PagesRouteSearchParams } from '~/modules/pages/types';
import { CreatePageForm } from '../create-page-form';
import DeletePages from '../delete-pages';

interface PagesTableBarProps extends Omit<BaseTableBarProps<Page, PagesRouteSearchParams>, 'queryKey'> {
  isCompact: boolean;
  setIsCompact: (isCompact: boolean) => void;
  total: number;
}

export const PagesTableBar = ({
  searchVars,
  setSearch,
  columns,
  setColumns,
  selected,
  clearSelection,
  isCompact,
  setIsCompact,
  total,
}: PagesTableBarProps) => {
  const { t } = useTranslation();

  const removeDialog = useDialoger((state) => state.remove);
  const createDialog = useDialoger((state) => state.create);

  const createButtonRef = useRef(null);
  const deleteButtonRef = useRef(null);

  const { q, order, sort } = searchVars;

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
      title: t('common:delete'),
      description: t('common:confirm.delete_counted_resource', {
        count: selected.length,
        resource: selected.length > 1 ? t('common:pages').toLowerCase() : t('common:page').toLowerCase(),
      }),
    });
  };

  const fetchExport = async (limit: number) => {
    const response = await getPages({
      query: { limit: String(limit), q, sort: sort || 'createdAt', order: order || 'asc', offset: '0' },
    });
    return response.items;
  };

  return (
    <TableBarContainer>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 ? (
            <>
              <TableBarButton
                variant="destructive"
                label="common:remove"
                icon={TrashIcon}
                className="relative"
                badge={selected.length}
                onClick={openDeleteDialog}
              />
              <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquareIcon} label="common:clear" />
            </>
          ) : (
            !isFiltered && (
              <TableBarButton
                label="common:create"
                icon={PlusIcon}
                onClick={() => {
                  createDialog(<CreatePageForm callback={onCreatePage} />, {
                    id: 'create-page',
                    triggerRef: createButtonRef,
                    className: 'md:max-w-2xl',
                    title: t('common:create_resource', { resource: t('common:page').toLowerCase() }),
                    titleContent: (
                      <UnsavedBadge title={t('common:create_resource', { resource: t('common:page').toLowerCase() })} />
                    ),
                  });
                }}
              />
            )
          )}
          {selected.length === 0 && (
            <TableCount count={total} label="common:page" isFiltered={isFiltered} onResetFilters={onResetFilters} />
          )}
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarContent>
          <TableSearch name="pageSearch" value={q} setQuery={onSearch} />
        </FilterBarContent>
      </TableFilterBar>

      <ColumnsView
        className="max-lg:hidden"
        columns={columns}
        setColumns={setColumns}
        isCompact={isCompact}
        setIsCompact={setIsCompact}
      />
      <Export
        className="max-lg:hidden"
        filename={`${appConfig.slug}-pages`}
        columns={columns}
        selectedRows={selected}
        fetchRows={fetchExport}
      />
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
