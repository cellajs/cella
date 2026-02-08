import { Link, useNavigate } from '@tanstack/react-router';
import i18n from 'i18next';
import { CopyCheckIcon, CopyIcon, DownloadIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { appConfig } from 'shared';
import type { Attachment } from '~/api.gen';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { AttachmentPreview } from '~/modules/attachment/attachment-preview';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import { getFileUrl } from '~/modules/attachment/helpers';
import { useAttachmentUrl } from '~/modules/attachment/hooks/use-attachment-url';
import { useBlobUploadStatus } from '~/modules/attachment/hooks/use-blob-sync-status';
import type { EllipsisOption } from '~/modules/common/data-table/table-ellipsis';
import { TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { PopConfirm } from '~/modules/common/popconfirm';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';

interface ThumbnailCellProps {
  row: Attachment;
  tabIndex: number;
}

export const ThumbnailCell = ({ row, tabIndex }: ThumbnailCellProps) => {
  const { id, filename, contentType, groupId } = row;
  const navigate = useNavigate();
  const setTriggerRef = useDialoger((state) => state.setTriggerRef);
  const cellRef = useRef<HTMLAnchorElement | null>(null);

  const wrapClass = 'flex space-x-2 items-center justify-center w-full h-full';

  // Use attachment URL hook - prefer thumbnail variant for table cells
  const { url, isLocal } = useAttachmentUrl(row, { preferredVariant: 'thumbnail' });

  const handleClick = (e: React.MouseEvent) => {
    // For non-local URLs, allow cmd/ctrl+click to open in new tab
    if (!isLocal && (e.metaKey || e.ctrlKey)) return;
    e.preventDefault();

    // Store focus anchor
    setTriggerRef(id, cellRef);

    navigate({
      to: '.',
      replace: false,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        attachmentDialogId: id,
        groupId: groupId || undefined,
      }),
    });
  };

  // Use regular anchor for blob URLs (local) since TanStack Router blocks blob: protocol
  // For remote URLs, use Link for proper router integration
  if (isLocal) {
    return (
      <a
        ref={cellRef}
        href={url ?? undefined}
        draggable="false"
        tabIndex={tabIndex}
        className={wrapClass}
        onClick={handleClick}
      >
        <AttachmentPreview name={filename} url={url ?? undefined} contentType={contentType} />
      </a>
    );
  }

  return (
    <Link
      to={url ?? undefined}
      ref={cellRef}
      draggable="false"
      tabIndex={tabIndex}
      className={wrapClass}
      onClick={handleClick}
    >
      <AttachmentPreview name={filename} url={url ?? undefined} contentType={contentType} />
    </Link>
  );
};

interface CopyUrlCellProps {
  row: Attachment;
  tabIndex: number;
}

export const CopyUrlCell = ({ row, tabIndex }: CopyUrlCellProps) => {
  const { t } = useTranslation();
  const { copyToClipboard, copied } = useCopyToClipboard();

  // Check if blob is uploaded to cloud
  const { isUploaded, hasLocalBlob } = useBlobUploadStatus(row.id);
  const canCopy = !hasLocalBlob || isUploaded;

  if (!canCopy) return <div className="text-muted text-center w-full">-</div>;

  const shareLink = `${appConfig.backendUrl}/${row.organizationId}/attachments/${row.id}/link`;
  return (
    <Button
      variant="cell"
      size="icon"
      tabIndex={tabIndex}
      className="h-full w-full"
      aria-label="Copy"
      data-tooltip="true"
      data-tooltip-content={copied ? t('common:copied') : t('common:copy')}
      onClick={() => copyToClipboard(shareLink)}
    >
      {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
    </Button>
  );
};

interface DownloadCellProps {
  row: Attachment;
  tabIndex: number;
}

export const DownloadCell = ({ row, tabIndex }: DownloadCellProps) => {
  const { t } = useTranslation();
  const { download, isInProgress } = useDownloader();

  // Check if blob is uploaded to cloud
  const { isUploaded, hasLocalBlob } = useBlobUploadStatus(row.id);
  const canDownload = !hasLocalBlob || isUploaded;

  if (!canDownload) return <div className="text-muted text-center w-full">-</div>;

  return (
    <Button
      variant="cell"
      size="icon"
      tabIndex={tabIndex}
      disabled={isInProgress}
      className="h-full w-full"
      aria-label="Download"
      data-tooltip="true"
      data-tooltip-content={t('common:download')}
      onClick={() =>
        getFileUrl(row.originalKey, row.public, row.organizationId).then((url) => download(url, row.filename))
      }
    >
      {isInProgress ? <Spinner className="size-4 text-foreground/80" noDelay /> : <DownloadIcon size={16} />}
    </Button>
  );
};

interface EllipsisCellProps {
  row: Attachment;
  tabIndex: number;
}

export const EllipsisCell = ({ row, tabIndex }: EllipsisCellProps) => {
  const { t } = useTranslation();
  const { copyToClipboard } = useCopyToClipboard();

  // Check if blob is uploaded to cloud
  const { isUploaded, hasLocalBlob } = useBlobUploadStatus(row.id);
  const canShare = !hasLocalBlob || isUploaded;

  // Build options - delete is always available, copy URL only if synced
  const ellipsisOptions: EllipsisOption<Attachment>[] = [
    {
      label: i18n.t('common:delete'),
      icon: TrashIcon,
      onSelect: (row) => {
        const { update } = useDropdowner.getState();
        const callback = () => useDropdowner.getState().remove();

        update({
          content: (
            <PopConfirm title={i18n.t('common:delete_confirm.text', { name: row.name })}>
              <DeleteAttachments attachments={[row]} callback={callback} />
            </PopConfirm>
          ),
        });
      },
    },
  ];

  if (canShare) {
    const shareLink = `${appConfig.backendUrl}/${row.organizationId}/attachments/${row.id}/link`;

    ellipsisOptions.push({
      label: i18n.t('common:copy_url'),
      icon: CopyIcon,
      onSelect: () => {
        copyToClipboard(shareLink);
        toaster(t('common:success.resource_copied', { resource: t('common:url') }), 'success');
        useDropdowner.getState().remove();
      },
    });
  }

  return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
};
