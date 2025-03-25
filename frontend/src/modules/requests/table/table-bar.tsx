import { config } from 'config';
import { Handshake, Trash, XSquare } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { sort } from 'virtua/unstable_core';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, BaseTableMethods } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { toaster } from '~/modules/common/toaster';
import { getRequests } from '~/modules/requests/api';
import DeleteRequests from '~/modules/requests/delete-requests';
import { requestsKeys } from '~/modules/requests/query';
import type { RequestsSearch } from '~/modules/requests/table/table-wrapper';
import type { Request } from '~/modules/requests/types';
import { invite } from '~/modules/system/api';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';

type RequestsTableBarProps = BaseTableMethods & BaseTableBarProps<Request, RequestsSearch>;

export const RequestsTableBar = ({ total, selected, searchVars, setSearch, columns, setColumns, clearSelection }: RequestsTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const selectedToWaitlist = useMemo(() => selected.filter((r) => r.type === 'waitlist' && !r.tokenId), [selected]);

  const { q, order } = searchVars;
  const isFiltered = !!q;

  const mutateQuery = useMutateQueryData(requestsKeys.table.base());

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
    const callback = () => {
      mutateQuery.remove(selected);
      toaster(t('common:success.delete_resources', { resources: t('common:requests') }), 'success');
      clearSelection();
    };

    createDialog(<DeleteRequests requests={selected} callback={callback} dialog />, {
      className: 'max-w-xl',
      title: t('common:delete'),
      description: t('common:confirm.delete_resources', { resources: t('common:requests').toLowerCase() }),
    });
  };

  const openInviteDialog = async () => {
    const waitlistRequests = selected.filter(({ type }) => type === 'waitlist');
    const emails = waitlistRequests.map(({ email }) => email);

    // add random token value so state it table changes
    const updatedWaitLists = waitlistRequests.map((req) => {
      return req;
    });

    try {
      // Send invite to users
      await invite({ emails, role: 'user' });
      toaster(t('common:success.user_invited'), 'success');

      mutateQuery.update(updatedWaitLists);
      clearSelection();
    } catch (error) {
      toaster(t('error:bad_request_action'), 'error');
    }
  };

  const fetchExport = async (limit: number) => {
    const { items } = await getRequests({ q, sort, order, limit });
    return items;
  };

  return (
    <TableBarContainer>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 && (
            <>
              {selectedToWaitlist.length > 0 && (
                <Button variant="darkSuccess" className="relative" onClick={openInviteDialog}>
                  <Badge context="button">{selectedToWaitlist.length}</Badge>
                  <Handshake size={16} />
                  <span className="ml-1 max-xs:hidden">{t('common:invite')}</span>
                </Button>
              )}
              <Button variant="destructive" className="relative" onClick={openDeleteDialog}>
                <Badge context="button">{selected.length}</Badge>
                <Trash size={16} />
                <span className="ml-1 max-lg:hidden">{t('common:remove')}</span>
              </Button>
              <Button variant="ghost" onClick={clearSelection}>
                <XSquare size={16} />
                <span className="ml-1">{t('common:clear')}</span>
              </Button>
            </>
          )}
          {selected.length === 0 && <TableCount count={total} type="request" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarContent>
          <TableSearch value={q} setQuery={onSearch} />
        </FilterBarContent>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      {/* Export */}
      <Export className="max-lg:hidden" filename={`${config.slug}-requests`} columns={columns} fetchRows={fetchExport} />

      {/* Focus view */}
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
