import { PlusIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '~/api.gen';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { PagesSearch } from '~/modules/pages/types';
import { useInfiniteQueryTotal } from '~/query/hooks/use-infinite-query-total';
import { CreatePageForm } from '../create-page-form';

interface PagesTableBarProps extends BaseTableBarProps<Page, PagesSearch> {
  isCompact: boolean;
  setIsCompact: (isCompact: boolean) => void;
  /** @default false */
  isSheet?: boolean;
}

export const PagesTableBar = ({
  queryKey,
  searchVars: search,
  setSearch,
  columns,
  setColumns,
  selected,
  clearSelection,
  isCompact,
  setIsCompact,
}: PagesTableBarProps) => {
  const { t } = useTranslation();

  const removeDialog = useDialoger((state) => state.remove);
  const createDialog = useDialoger((state) => state.create);

  const createButtonRef = useRef(null);

  const isFiltered = !!search.q;
  const onResetFilter = () => {
    setSearch({ q: '' });
    clearSelection();
  };

  const total = useInfiniteQueryTotal(queryKey);

  return (
    <div className="p-4">
      <TableBarContainer>
        <TableFilterBar isFiltered={isFiltered} onResetFilters={onResetFilter}>
          <FilterBarActions>
            {selected.length ? (
              <>
                {/* publish */}
                {/* archive */}
                {/* delete? */}
                <TableBarButton onClick={clearSelection} label="common:clear" icon={XSquareIcon} variant="ghost" />
                <TableCount count={total} label="common:organization" isFiltered={isFiltered} onResetFilters={onResetFilter} />
              </>
            ) : (
              <>
                {!isFiltered && (
                  <TableBarButton
                    label="common:create"
                    icon={PlusIcon}
                    onClick={() =>
                      createDialog(<CreatePageForm organizationId="" isDialog callback={() => removeDialog('create-page')} />, {
                        id: 'create-page',
                        triggerRef: createButtonRef,
                        className: 'md:max-w-2xl',
                        title: t('common:create_resource', { resource: t('common:page').toLowerCase() }),
                        titleContent: <UnsavedBadge title={t('common:create_resource', { resource: t('common:page').toLowerCase() })} />,
                      })
                    }
                  />
                )}
              </>
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch
              name="organizationSearch"
              value={search.q}
              setQuery={(q) => {
                clearSelection();
                setSearch({ q });
              }}
            />
          </FilterBarContent>
        </TableFilterBar>

        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} isCompact={isCompact} setIsCompact={setIsCompact} />
        {/* <Export
          className="max-lg:hidden"
          filename={`${appConfig.slug}-organizations`}
          columns={columns}
          selectedRows={selected}
          fetchRows={fetchExport}
        /> */}
        {/* only if not sheet? */}
        <FocusView iconOnly />
      </TableBarContainer>
    </div>
  );
};
