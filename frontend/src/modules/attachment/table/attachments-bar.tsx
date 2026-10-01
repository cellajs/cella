import { InfoIcon, TrashIcon, UploadIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import type { AttachmentsTableProps } from '~/modules/attachment/table/attachments-table';
import { useAttachmentsUploadDialog } from '~/modules/attachment/table/use-attachments-upload-dialog';
import type { AttachmentsRouteSearchParams } from '~/modules/attachment/types';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type AttachmentsTableBarProps = AttachmentsTableProps & BaseTableBarProps<Attachment, AttachmentsRouteSearchParams>;

export function AttachmentsTableBar({
  channel,
  selected,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
  isSheet = false,
  canUpload = false,
  queryKey,
}: AttachmentsTableBarProps) {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);
  // Placement seam: a sub-organization channel homes its uploads on itself; the organization row is the
  // org. Publication is row-local, so the channel's `publicAt` is only the default a new row starts with.
  const isOrganization = channel.entityType === 'organization';
  const organizationId = !isOrganization && 'organizationId' in channel ? String(channel.organizationId) : channel.id;
  const publicAt = 'publicAt' in channel && typeof channel.publicAt === 'string' ? channel.publicAt : null;
  const placement = { ...(isOrganization ? {} : { [appConfig.entityIdColumnKeys[channel.entityType]]: channel.id }), publicAt };
  const { open } = useAttachmentsUploadDialog(channel.tenantId, organizationId, placement);
  const resolveCan = useResolveCan();

  const deleteButtonRef = useRef(null);

  const total = useListQueryTotal(queryKey);

  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '' } });

  // Bulk delete acts only on rows this user may delete; the badge shows that count when it differs from the selection.
  const deletable = selected.filter((row) =>
    resolveCan(channel.can?.attachment?.delete, row.createdBy, { row: hierarchy.resolveDeepestAncestorId('attachment', row), channel: channel.id }),
  );

  const openDeleteDialog = () => {
    createDialog(<DeleteAttachments dialog attachments={deletable} callback={clearSelection} />, {
      id: 'delete-attachments',
      triggerRef: deleteButtonRef,
      className: 'max-w-xl',
      title: t('c:remove_resource', { resource: t('c:attachment_other').toLowerCase() }),
      description: t('c:confirm.delete_counted_resource', {
        count: deletable.length,
        resource: deletable.length > 1 ? t('c:attachment_other').toLowerCase() : t('c:attachment').toLowerCase(),
      }),
    });
  };

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:attachment"
      searchName="attachmentSearch"
      allowOfflineSearch
      actions={canUpload && <TableBarButton icon={UploadIcon} label="c:upload" onClick={() => open()} />}
      focusView={!isSheet}
      selection={{
        count: selected.length,
        onClear: clearSelection,
        children: deletable.length > 0 && (
          <TableBarButton
            ref={deleteButtonRef}
            variant="destructive"
            onClick={openDeleteDialog}
            className="relative"
            badge={deletable.length < selected.length ? deletable.length : undefined}
            icon={TrashIcon}
            label="c:delete"
          />
        ),
      }}
      after={
        !!total && (
          <AlertBanner id="edit_attachment" variant="plain" className="mb-4" icon={InfoIcon} animate>
            {t('c:edit_attachment.text')}
          </AlertBanner>
        )
      }
    />
  );
}
