import { PartyPopperIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import type { Request } from 'sdk';
import { appConfig } from 'shared';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { openDeleteDialog } from '~/modules/common/open-confirm';
import { DeleteRequests } from '~/modules/requests/delete-requests';
import { fetchRequestsForExport, useSendApprovalInviteMutation } from '~/modules/requests/query';
import type { RequestsRouteSearchParams } from '~/modules/requests/types';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type RequestsTableBarProps = BaseTableBarProps<Request, RequestsRouteSearchParams>;

export function RequestsTableBar({ selected, queryKey, searchVars, setSearch, columns, setColumns, clearSelection }: RequestsTableBarProps) {
  const total = useListQueryTotal(queryKey);

  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const uninvited = selected.filter((request) => request.type === 'waitlist' && !request.wasInvited);

  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '' } });

  const { mutate: invite } = useSendApprovalInviteMutation();

  const confirmDelete = () =>
    openDeleteDialog({
      id: 'delete-requests',
      triggerRef: deleteButtonRef,
      resource: 'c:request',
      count: selected.length,
      content: <DeleteRequests requests={selected} callback={clearSelection} />,
    });

  const inviteSelected = () => invite(uninvited, { onSuccess: clearSelection });

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:request"
      searchName="requestSearch"
      export={{ filename: `${appConfig.slug}-requests`, fetchRows: (limit, offset) => fetchRequestsForExport({ ...searchVars, limit, offset }) }}
      selection={{
        count: selected.length,
        onClear: clearSelection,
        children: (
          <>
            {uninvited.length > 0 && (
              <TableBarButton
                badge={uninvited.length < selected.length ? uninvited.length : undefined}
                variant="success"
                label="c:invite"
                icon={PartyPopperIcon}
                onClick={inviteSelected}
              />
            )}
            <TableBarButton ref={deleteButtonRef} variant="destructive" icon={TrashIcon} label="c:delete" onClick={confirmDelete} />
          </>
        ),
      }}
    />
  );
}
