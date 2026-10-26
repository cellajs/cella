import { InfoIcon, TrashIcon, UploadIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import { useCanDeleteAttachment } from '~/modules/attachment/table/attachments-columns';
import type { AttachmentsTableProps } from '~/modules/attachment/table/attachments-table';
import { useAttachmentsUploadDialog } from '~/modules/attachment/table/use-attachments-upload-dialog';
import type { AttachmentsRouteSearchParams } from '~/modules/attachment/types';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { openDeleteDialog } from '~/modules/common/open-confirm';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
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
  // A sub-organization channel homes its uploads on itself; the organization row is the
  // org. Public read is row-local, so the channel's `public` flag is only the value a new row starts with.
  const isOrganization = channel.entityType === 'organization';
  const organizationId = channelOrganizationId(channel);
  const isPublic = 'public' in channel && channel.public === true;
  const placement = { ...(!isOrganization && { [appConfig.entityIdColumnKeys[channel.entityType]]: channel.id }), public: isPublic };
  const { open } = useAttachmentsUploadDialog(channel.tenantId, organizationId, placement);
  const canDelete = useCanDeleteAttachment(channel);

  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const total = useListQueryTotal(queryKey);

  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '' } });

  // Bulk delete acts only on rows this user may delete; the badge shows that count when it differs from the selection.
  const deletable = selected.filter(canDelete);

  const confirmDelete = () =>
    openDeleteDialog({
      id: 'delete-attachments',
      triggerRef: deleteButtonRef,
      resource: 'c:attachment',
      count: deletable.length,
      content: <DeleteAttachments attachments={deletable} callback={clearSelection} />,
    });

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:attachment"
      searchName="attachmentSearch"
      allowOfflineSearch
      actions={canUpload && <TableBarButton icon={UploadIcon} label="c:upload" onClick={open} />}
      focusView={!isSheet}
      selection={{
        count: selected.length,
        onClear: clearSelection,
        children: deletable.length > 0 && (
          <TableBarButton
            ref={deleteButtonRef}
            variant="destructive"
            onClick={confirmDelete}
            badge={deletable.length < selected.length ? deletable.length : undefined}
            icon={TrashIcon}
            label="c:delete"
          />
        ),
      }}
      after={
        !!total && (
          <AlertBanner id="edit_attachment" variant="info" className="mb-4" icon={InfoIcon} animate>
            {t('c:edit_attachment.text')}
          </AlertBanner>
        )
      }
    />
  );
}
