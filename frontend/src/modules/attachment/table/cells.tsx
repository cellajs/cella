import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import i18n from 'i18next';
import { CopyCheckIcon, CopyIcon, DownloadIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { type Attachment, getPresignedUrl } from '~/api.gen';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import DeleteAttachments from '~/modules/attachment/delete-attachments';
import AttachmentPreview from '~/modules/attachment/table/preview';
import { isLocalAttachment } from '~/modules/attachment/utils';
import type { EllipsisOption } from '~/modules/common/data-table/table-ellipsis';
import TableEllipsis from '~/modules/common/data-table/table-ellipsis';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { PopConfirm } from '~/modules/common/popconfirm';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';

interface ThumbnailCellProps {
  row: Attachment;
  tabIndex: number;
}

export const ThumbnailCell = ({ row, tabIndex }: ThumbnailCellProps) => {
  const { id, filename, contentType, thumbnailKey, public: isPublic, originalKey, groupId } = row;
  const navigate = useNavigate();
  const setTriggerRef = useDialoger((state) => state.setTriggerRef);
  const cellRef = useRef<HTMLAnchorElement | null>(null);

  const wrapClass = 'flex space-x-2 items-center justify-center w-full h-full';
  const key = thumbnailKey || originalKey;

  // The computed URL for preview and link
  const { data: url } = useQuery({
    queryKey: ['presigned-url', key, isPublic],
    queryFn: () => getPresignedUrl({ query: { key, isPublic } }),
    enabled: !isLocalAttachment(key),
  });

  // For files that are NOT blob URLs → just render preview, no link wrap
  if (isLocalAttachment(key)) {
    return (
      <div className={wrapClass}>
        <AttachmentPreview name={filename} url={key} contentType={contentType} />
      </div>
    );
  }

  // Remote URLs: wrap in a Link with custom behavior
  return (
    <Link
      to={url}
      ref={cellRef}
      draggable="false"
      tabIndex={tabIndex}
      className={wrapClass}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return; // allow new tab
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
      }}
    >
      <AttachmentPreview name={filename} url={url} contentType={contentType} />
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

  const key = row.thumbnailKey || row.originalKey;
  const isLocal = isLocalAttachment(key);

  if (isLocal) return <div className="text-muted text-center w-full">-</div>;

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

  const key = row.thumbnailKey || row.originalKey;
  const isLocal = isLocalAttachment(key);

  if (isLocal) return <div className="text-muted text-center w-full">-</div>;

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
        getPresignedUrl({ query: { key: row.originalKey, isPublic: row.public } }).then((url) =>
          download(url, row.filename),
        )
      }
    >
      {isInProgress ? <Spinner className="size-4 text-foreground/80" noDelay /> : <DownloadIcon size={16} />}
    </Button>
  );
};

interface EllipsisCellProps {
  row: Attachment;
  tabIndex: number;
  organizationSlug: string;
}

export const EllipsisCell = ({ row, tabIndex, organizationSlug }: EllipsisCellProps) => {
  const { t } = useTranslation();
  const { copyToClipboard } = useCopyToClipboard();

  const key = row.thumbnailKey || row.originalKey;
  const isLocal = isLocalAttachment(key);

  if (isLocal) return <div className="text-muted text-center w-full">-</div>;

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
              <DeleteAttachments attachments={[row]} organizationSlug={organizationSlug} callback={callback} />
            </PopConfirm>
          ),
        });
      },
    },
  ];

  if (!isLocal) {
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
