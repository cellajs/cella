import { config } from 'config';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { dialog } from '~/modules/common/dialoger/state';
import { toaster } from '~/modules/common/toaster';
import { getRequests } from '~/modules/requests/api';
import DeleteRequests from '~/modules/requests/delete-requests';
import { requestsKeys } from '~/modules/requests/query';
import { useColumns } from '~/modules/requests/table/columns';
import BaseDataTable from '~/modules/requests/table/table';
import { RequestsTableBar } from '~/modules/requests/table/table-bar';
import type { Request } from '~/modules/requests/types';
import { invite } from '~/modules/system/api';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { RequestsTableRoute, type requestSearchSchema } from '~/routes/system';

const LIMIT = config.requestLimits.requests;

export type RequestsSearch = z.infer<typeof requestSearchSchema>;

const RequestsTable = () => {
  const { t } = useTranslation();

  const { search, setSearch } = useSearchParams<RequestsSearch>({ from: RequestsTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  const mutateQuery = useMutateQueryData(requestsKeys.list());

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Request[]>([]);

  // Build columns
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    dialog(
      <DeleteRequests
        requests={selected}
        callback={(requests) => {
          toaster(t('common:success.delete_resources', { resources: t('common:requests') }), 'success');
          mutateQuery.remove(requests);
          clearSelection();
        }}
        dialog
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('common:delete'),
        description: t('common:confirm.delete_resources', { resources: t('common:requests').toLowerCase() }),
      },
    );
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
    <div className="flex flex-col gap-4 h-full">
      <RequestsTableBar
        total={total}
        selected={selected}
        columns={columns}
        setColumns={setColumns}
        q={q ?? ''}
        setSearch={setSearch}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openInviteDialog={openInviteDialog}
        fetchExport={fetchExport}
      />
      <BaseDataTable
        ref={dataTableRef}
        columns={columns}
        queryVars={{ q, sort, order, limit }}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setTotal={setTotal}
        setSelected={setSelected}
      />
    </div>
  );
};

export default RequestsTable;
