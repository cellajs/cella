import { useQuery } from '@tanstack/react-query';
import { useColumns } from '~/modules/me/invitations-table/columns';
import { DataTable } from '~/modules/common/data-table';
import { InfoIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { useTranslation } from 'react-i18next';
import { meInvitationsQueryOptions } from '../query';
import { Invitation } from '../types';


const InvitationsTable = () => {
  const { t } = useTranslation();

  // Build columns
  const columns = useColumns();

  const queryOptions = meInvitationsQueryOptions();
  const {
    data,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    ...queryOptions,
  });

  // Update rows
  // const onRowsChange = (changedRows: Attachment[], { indexes, column }: RowsChangeData<Attachment>) => {
  //   if (column.key !== 'name') return;

  //   // If name is changed, update the attachment
  //   for (const index of indexes) {
  //     const attachment = changedRows[index];
  //     attachmentUpdateMutation.mutate({
  //       id: attachment.id,
  //       orgIdOrSlug: entity.id,
  //       name: attachment.name,
  //       localUpdate: !isCDNUrl(attachment.url),
  //     });
  //   }
  // };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Explainer alert box */}
      <AnimatePresence initial={false}>
        {
          <motion.div
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
            <AlertWrap id="edit_attachment" variant="plain" icon={InfoIcon}>
              {t('common:edit_attachment.text')}
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
            rowKeyGetter: (row) => row.inactiveMembership.id,
            columns: columns.filter((column) => column.visible),
            enableVirtualization: false,
            error,
            isLoading,
            isFetching,
            hasNextPage: false,
            NoRowsComponent: (<></>),
          }}
        />
      </div>
    </div>
  );
};

export default InvitationsTable;
