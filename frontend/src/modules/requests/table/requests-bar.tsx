import { PartyPopperIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Request } from 'sdk';
import { appConfig } from 'shared';
import { ConfirmText } from '~/modules/common/confirm-text';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps, CallbackArgs } from '~/modules/common/data-table/types';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/toaster';
import { DeleteRequests } from '~/modules/requests/delete-requests';
import { fetchRequestsForExport, useSendApprovalInviteMutation } from '~/modules/requests/query';
import type { RequestsRouteSearchParams } from '~/modules/requests/types';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type RequestsTableBarProps = BaseTableBarProps<Request, RequestsRouteSearchParams>;

export function RequestsTableBar({ selected, queryKey, searchVars, setSearch, columns, setColumns, clearSelection }: RequestsTableBarProps) {
  const { t } = useTranslation();

  const total = useListQueryTotal(queryKey);

  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const uninvited = selected.filter((request) => request.type === 'waitlist' && !request.wasInvited);

  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '' } });

  const { mutate: invite } = useSendApprovalInviteMutation();

  const openDeleteDialog = () => {
    const callback = (args: CallbackArgs<Request[]>) => {
      if (args.status === 'success') {
        const message =
          args.data.length === 1
            ? t('c:success.delete_resource', { resource: t('c:request') })
            : t('c:success.delete_counted_resources', {
                count: args.data.length,
                resources: t('c:request_other').toLowerCase(),
              });
        toaster.success(message);
      }
      clearSelection();
    };

    dialoger.getState().create(<DeleteRequests requests={selected} callback={callback} dialog />, {
      id: 'delete-requests',
      triggerRef: deleteButtonRef,
      className: 'max-w-xl',
      title: t('c:delete'),
      description: (
        <ConfirmText
          i18nKey="c:confirm.delete_counted_resource"
          values={{
            count: selected.length,
            resource: t('c:request', { count: selected.length }).toLowerCase(),
          }}
        />
      ),
    });
  };

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
            <TableBarButton ref={deleteButtonRef} variant="destructive" icon={TrashIcon} label="c:delete" onClick={openDeleteDialog} />
          </>
        ),
      }}
    />
  );
}
