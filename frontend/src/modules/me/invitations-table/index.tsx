import { useQuery } from '@tanstack/react-query';
import { InfoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useColumns } from '~/modules/me/invitations-table/invitations-columns';
import { meInvitationsQueryOptions } from '~/modules/me/query';
import type { Invitation } from '~/modules/me/types';

function rowKeyGetter(row: Invitation) {
  return row.inactiveMembership.id;
}

export function InvitationsTable() {
  const { t } = useTranslation();

  const columns = useColumns();

  const queryOptions = meInvitationsQueryOptions();
  const { data, isLoading, isFetching, error } = useQuery({
    ...queryOptions,
  });

  return (
    <div className="flex h-full flex-col gap-4">
      <AlertBanner id="accept_invitations" variant="plain" icon={InfoIcon} animate>
        {t('c:accept_invitations.text')}
      </AlertBanner>

      <DataTable<Invitation>
        {...{
          rows: data?.items,
          rowHeight: 52,
          rowKeyGetter,
          columns,
          enableVirtualization: true,
          readOnly: true,
          error,
          isLoading,
          isFetching,
          hasNextPage: false,
          NoRowsComponent: <></>,
        }}
      />
    </div>
  );
}
