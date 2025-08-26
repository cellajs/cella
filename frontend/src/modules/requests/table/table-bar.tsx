import { appConfig } from 'config';
import { PartyPopper, Trash, XSquare } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getRequests } from '~/api.gen';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, BaseTableMethods } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { toaster } from '~/modules/common/toaster/service';
import DeleteRequests from '~/modules/requests/delete-requests';
import { requestsKeys, useSendApprovalInviteMutation } from '~/modules/requests/query';
import type { RequestsSearch } from '~/modules/requests/table/table-wrapper';
import type { Request } from '~/modules/requests/types';
import { useInfiniteQueryTotal } from '~/query/hooks/use-infinite-query-total';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';

type RequestsTableBarProps = BaseTableMethods & BaseTableBarProps<Request, RequestsSearch>;

export const RequestsTableBar = ({ selected, queryKey, searchVars, setSearch, columns, setColumns, clearSelection }: RequestsTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const total = useInfiniteQueryTotal(queryKey);

  const deleteButtonRef = useRef(null);

  const selectedToWaitlist = useMemo(() => selected.filter((r) => r.type === 'waitlist' && !r.wasInvited), [selected]);

  const { q, order, sort } = searchVars;
  const isFiltered = !!q;

  const mutateQuery = useMutateQueryData(requestsKeys.table.base());

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
    const callback = (requests: Request[]) => {
      mutateQuery.remove(selected);
      const message =
        requests.length === 1
          ? t('common:success.delete_resource', { resource: t('common:request') })
          : t('common:success.delete_counted_resources', { count: requests.length, resources: t('common:requests').toLowerCase() });
      toaster(message, 'success');
      clearSelection();
    };

    createDialog(<DeleteRequests requests={selected} callback={callback} dialog />, {
      id: 'delete-requests',
      triggerRef: deleteButtonRef,
      className: 'max-w-xl',
      title: t('common:delete'),
      description: t('common:confirm.delete_counted_resource', {
        count: selected.length,
        resource: selected.length > 1 ? t('common:requests').toLowerCase() : t('common:request').toLowerCase(),
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
          mutateQuery.update(updatedWaitLists);
          clearSelection();
        },
      },
    );
  };

  const fetchExport = async (limit: number) => {
    const response = await getRequests({
      query: { q, sort: sort || 'createdAt', order: order || 'asc', limit: String(limit), offset: '0' },
    });
    return response.items;
  };

  return (
    <TableBarContainer>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 && (
            <>
              {selectedToWaitlist.length > 0 && (
                <TableBarButton
                  badge={selectedToWaitlist.length}
                  variant="darkSuccess"
                  className="relative"
                  label={t('common:invite')}
                  icon={PartyPopper}
                  onClick={approveSelectedRequests}
                />
              )}
              <TableBarButton
                ref={deleteButtonRef}
                variant="destructive"
                icon={Trash}
                label={t('common:remove')}
                badge={selected.length}
                className="relative"
                onClick={openDeleteDialog}
              />
              <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquare} label={t('common:clear')} />
            </>
          )}
          {selected.length === 0 && <TableCount count={total} label="common:request" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarContent>
          <TableSearch name="requestSearch" value={q} setQuery={onSearch} />
        </FilterBarContent>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      {/* Export */}
      <Export className="max-lg:hidden" filename={`${appConfig.slug}-requests`} columns={columns} fetchRows={fetchExport} />

      {/* Focus view */}
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
