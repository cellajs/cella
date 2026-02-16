import { useQuery } from '@tanstack/react-query';
import { InfoIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { DataTable } from '~/modules/common/data-table';
import { useColumns } from '~/modules/me/invitations-table/invitations-columns';
import { meInvitationsQueryOptions } from '~/modules/me/query';
import { Invitation } from '~/modules/me/types';

/** Stable row key getter function - defined outside component to prevent re-renders */
function rowKeyGetter(row: Invitation) {
  return row.inactiveMembership.id;
}

export function InvitationsTable() {
  const { t } = useTranslation();

  // Build columns
  const columns = useColumns();

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

  const queryOptions = meInvitationsQueryOptions();
  const { data, isLoading, isFetching, error } = useQuery({
    ...queryOptions,
  });

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Explainer alert box */}
      <AnimatePresence initial={false}>
        {
          <motion.div
            className="empty:hidden"
            key="alert"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.3 },
              opacity: { delay: 0.6, duration: 0.2 },
            }}
            style={{ overflow: 'hidden' }}
          >
            <AlertWrap id="accept_invitations" variant="plain" icon={InfoIcon}>
              {t('common:accept_invitations.text')}
            </AlertWrap>
          </motion.div>
        }
      </AnimatePresence>

      <div className="rdg-readonly">
        <DataTable<Invitation>
          {...{
            rows: data?.items,
            rowHeight: 52,
            // onRowsChange,
            rowKeyGetter,
            columns: visibleColumns,
            enableVirtualization: true,
            error,
            isLoading,
            isFetching,
            hasNextPage: false,
            NoRowsComponent: <></>,
          }}
        />
      </div>
    </div>
  );
}
