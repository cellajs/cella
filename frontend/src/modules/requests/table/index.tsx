import { config } from 'config';
import { Suspense, lazy, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { createToast } from '~/lib/toasts';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { dialog } from '~/modules/common/dialoger/state';
import { invite } from '~/modules/general/api';
import { deleteRequests, getRequests } from '~/modules/requests/api';
import { useColumns } from '~/modules/requests/columns';
import DeleteRequests from '~/modules/requests/delete-requests';
import { openFeedbackLetterSheet } from '~/modules/requests/helpers';
import { requestsKeys } from '~/modules/requests/query';
import { RequestsTableHeaderBar } from '~/modules/requests/table/table-header';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { RequestsTableRoute, type requestSearchSchema } from '~/routes/system';
import type { BaseTableMethods, Request } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';

const BaseDataTable = lazy(() => import('~/modules/requests/table/table'));
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

  // Update total and selected counts
  const updateCounts = (newSelected: Request[], newTotal: number | undefined) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Build columns
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openNewsletterSheet = () => {
    const requests = selected.filter((request) => request.type !== 'waitlist');
    const emails = requests.map((request) => request.email);
    openFeedbackLetterSheet(emails, clearSelection);
  };

  const openRemoveDialog = () => {
    dialog(
      <DeleteRequests
        requests={selected}
        callback={(requests) => {
          createToast(t('common:success.delete_resources', { resources: t('common:requests') }), 'success');
          mutateQuery.remove(requests);
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
    const waitlistRequests = selected.filter((request) => request.type === 'waitlist');
    const emails = waitlistRequests.map((request) => request.email);
    const requestIds = waitlistRequests.map((request) => request.id);

    try {
      // Send invite to users
      await invite({ emails, role: 'user' });
      createToast(t('common:success.user_invited'), 'success');

      // TODO: decide delete requests or change status to 'processed'
      await deleteRequests(requestIds);
      mutateQuery.remove(waitlistRequests);
    } catch (error) {
      createToast(t('common:error.bad_request_action'), 'error');
    }
  };

  const fetchExport = async (limit: number) => {
    const { items } = await getRequests({ q, sort, order, limit });
    return items;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <RequestsTableHeaderBar
        total={total}
        selected={selected}
        columns={columns}
        setColumns={setColumns}
        q={q ?? ''}
        setSearch={setSearch}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openInviteDialog={openInviteDialog}
        openNewsletterSheet={openNewsletterSheet}
        fetchExport={fetchExport}
      />
      <Suspense>
        <BaseDataTable
          ref={dataTableRef}
          columns={columns}
          queryVars={{ q, sort, order, limit }}
          updateCounts={updateCounts}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
        />
      </Suspense>
    </div>
  );
};

export default RequestsTable;
