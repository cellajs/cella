import { InfoIcon, TrashIcon, UploadIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import type { AttachmentsTableProps } from '~/modules/attachment/table/attachments-table';
import { useAttachmentsUploadDialog } from '~/modules/attachment/table/use-attachments-upload-dialog';
import type { AttachmentsRouteSearchParams } from '~/modules/attachment/types';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { openDeleteDialog } from '~/modules/common/open-confirm';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import { useCan } from '~/modules/entities/use-can';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type AttachmentsTableBarProps = AttachmentsTableProps & BaseTableBarProps<Attachment, AttachmentsRouteSearchParams> & { canUpload: boolean };

export function AttachmentsTableBar({
  channel,
  selected,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
  canUpload,
  queryKey,
}: AttachmentsTableBarProps) {
  const { t } = useTranslation();
  // A sub-organization channel homes its uploads on itself; the organization row is the
  // org. A row holds its home channel's `public`, so the optimistic one starts with it.
  const isOrganization = channel.entityType === 'organization';
  const organizationId = channelOrganizationId(channel);
  const isPublic = 'public' in channel && channel.public === true;
  const placement = { ...(!isOrganization && { [appConfig.entityIdColumnKeys[channel.entityType]]: channel.id }), public: isPublic };
  const { open } = useAttachmentsUploadDialog(channel.tenantId, organizationId, placement);
  const can = useCan();

  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const total = useListQueryTotal(queryKey);

  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '' } });

  // Bulk delete acts only on rows this user may delete; the badge shows that count when it differs from the selection.
  const deletable = selected.filter((row) => can('delete', 'attachment', row));

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
      action={canUpload ? { icon: UploadIcon, label: t('c:upload'), onClick: () => open() } : undefined}
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
