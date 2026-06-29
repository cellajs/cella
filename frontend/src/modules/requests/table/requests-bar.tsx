import { PartyPopperIcon, TrashIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Request } from 'sdk';
import { appConfig } from 'shared';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { Export } from '~/modules/common/data-table/export';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { toaster } from '~/modules/common/toaster/toaster';
import { DeleteRequests } from '~/modules/requests/delete-requests';
import { fetchRequestsForExport, requestsKeys, useSendApprovalInviteMutation } from '~/modules/requests/query';
import type { RequestsRouteSearchParams } from '~/modules/requests/types';
import { cacheRemove, cacheUpdate } from '~/query/basic/cache-mutations';
import { useInfiniteQueryTotal } from '~/query/basic/use-infinite-query-total';

type RequestsTableBarProps = BaseTableBarProps<Request, RequestsRouteSearchParams>;

export const RequestsTableBar = ({
  selected,
  queryKey,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
}: RequestsTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const total = useInfiniteQueryTotal(queryKey);

  const deleteButtonRef = useRef(null);

  const selectedToWaitlist = selected.filter((r) => r.type === 'waitlist' && !r.wasInvited);

  const { q, order, sort } = searchVars;
  const isFiltered = !!q;

  const requestsListKey = requestsKeys.table.base();

  const { mutateAsync: approveRequests } = useSendApprovalInviteMutation();

  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
    clearSelection();
  };

  const openDeleteDialog = () => {
    const callback = (args: CallbackArgs<Request[]>) => {
      cacheRemove(requestsListKey, selected);
      if (args.status === 'success') {
        const message =
          args.data.length === 1
            ? t('c:success.delete_resource', { resource: t('c:request') })
            : t('c:success.delete_counted_resources', {
                count: args.data.length,
                resources: t('c:requests').toLowerCase(),
              });
        toaster(message, 'success');
      }
      clearSelection();
    };

    createDialog(<DeleteRequests requests={selected} callback={callback} dialog />, {
      id: 'delete-requests',
      triggerRef: deleteButtonRef,
      className: 'max-w-xl',
      title: t('c:delete'),
      description: t('c:confirm.delete_counted_resource', {
        count: selected.length,
        resource: selected.length > 1 ? t('c:requests').toLowerCase() : t('c:request').toLowerCase(),
      }),
    });
  };

  const approveSelectedRequests = () => {
    const waitlistRequests = selected.filter(({ type }) => type === 'waitlist');
    const emails = waitlistRequests.map(({ email }) => email);

    const updatedWaitLists = waitlistRequests.map((reqInfo) => ({
      ...reqInfo,
      wasInvited: true,
    }));

    approveRequests(
      { emails },
      {
        onSuccess: () => {
          cacheUpdate(requestsListKey, updatedWaitLists);
          clearSelection();
        },
      },
    );
  };

  const fetchExport = async (limit: number) => {
    return fetchRequestsForExport({ limit, q, sort: sort || 'createdAt', order: order || 'asc' });
  };

  return (
    <TableBarContainer searchVars={searchVars} offsetTop={48}>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 && (
            <>
              {selectedToWaitlist.length > 0 && (
                <TableBarButton
                  badge={selectedToWaitlist.length}
                  variant="success"
                  className="relative"
                  label="c:invite"
                  icon={PartyPopperIcon}
                  onClick={approveSelectedRequests}
                />
              )}
              <TableBarButton
                ref={deleteButtonRef}
                variant="destructive"
                icon={TrashIcon}
                label="c:remove"
                badge={selected.length}
                className="relative"
                onClick={openDeleteDialog}
              />
              <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquareIcon} label="c:clear" />
            </>
          )}
          {selected.length === 0 && (
            <TableCount count={total} label="c:request" isFiltered={isFiltered} onResetFilters={onResetFilters} />
          )}
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarSearch>
          <TableSearch name="requestSearch" value={q} setQuery={onSearch} />
        </FilterBarSearch>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      {/* Export */}
      <Export
        className="max-lg:hidden"
        filename={`${appConfig.slug}-requests`}
        columns={columns}
        fetchRows={fetchExport}
      />

      {/* Focus view */}
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
