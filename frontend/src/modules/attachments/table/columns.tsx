import { Link, useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { Cloud, CloudOff, CopyCheckIcon, CopyIcon, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import AttachmentThumb from '~/modules/attachments/attachment-thumb';
import { formatBytes } from '~/modules/attachments/table/helpers';
import type { Attachment } from '~/modules/attachments/types';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { dateShort } from '~/utils/date-short';

export const useColumns = (isAdmin: boolean, isSheet: boolean) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);
  const navigate = useNavigate();

  const columns: ColumnOrColumnGroup<Attachment>[] = [
    CheckboxColumn,
    {
      key: 'thumbnail',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row: { url, filename, contentType, groupId }, tabIndex }) => (
        <Link
          id={`attachment-cell-${url}`}
          to={url}
          tabIndex={tabIndex}
          className="flex space-x-2 items-center justify-center outline-0 ring-0 group w-full h-full"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            navigate({
              to: '.',
              replace: true,
              resetScroll: false,
              search: (prev) => ({ ...prev, attachmentPreview: url, groupId: groupId || undefined }),
            });
          }}
        >
          <AttachmentThumb url={url} name={filename} contentType={contentType} />
        </Link>
      ),
    },
    {
      key: 'name',
      name: t('common:name'),
      editable: true,
      visible: true,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <strong>{row.name || '-'}</strong>,
      ...(isAdmin && {
        renderEditCell: ({ row, onRowChange }) => (
          <Input value={row.name} onChange={(e) => onRowChange({ ...row, name: e.target.value })} autoFocus />
        ),
      }),
    },
    {
      key: 'storeType',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row }) => (
        <div className="flex items-center h-full w-full">
          {row.url.startsWith(config.publicCDNUrl) ? <Cloud className="text-success" size={16} /> : <CloudOff className="opacity-50" size={16} />}
        </div>
      ),
    },
    {
      key: 'url',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { copyToClipboard, copied } = useCopyToClipboard();
        if (!row.url.startsWith(config.publicCDNUrl)) return <div className="text-muted text-center w-full">-</div>;

        const shareLink = `${config.backendUrl}/${row.organizationId}/attachments/${row.id}/link`;
        return (
          <Button
            variant="cell"
            size="icon"
            tabIndex={tabIndex}
            className="h-full w-full"
            aria-label="Copy"
            onClick={() => copyToClipboard(shareLink)}
          >
            {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
          </Button>
        );
      },
    },
    {
      key: 'download',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { download } = useDownloader();
        if (!row.url.startsWith(config.publicCDNUrl)) return <div className="text-muted text-center w-full">-</div>;
        return (
          <Button
            variant="cell"
            size="icon"
            tabIndex={tabIndex}
            className="h-full w-full"
            aria-label="Download"
            onClick={() => download(row.url, row.filename)}
          >
            <Download size={16} />
          </Button>
        );
      },
    },
    {
      key: 'filename',
      name: t('common:filename'),
      visible: !isMobile,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <span tabIndex={tabIndex} className="group-hover:underline underline-offset-4 truncate font-light">
          {row.filename || <span className="text-muted">-</span>}
        </span>
      ),
    },
    {
      key: 'contentType',
      name: t('common:content_type'),
      sortable: false,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      minWidth: 140,
      renderCell: ({ row, tabIndex }) => {
        if (!row.contentType) return <span className="text-muted">-</span>;
        return (
          <span tabIndex={tabIndex} className="font-light">
            {row.contentType}
          </span>
        );
      },
    },
    {
      key: 'size',
      name: t('common:size'),
      sortable: false,
      visible: !isMobile,
      width: 100,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <div className="inline-flex items-center gap-1 relative font-light group h-full w-full opacity-50">{formatBytes(row.size)}</div>
      ),
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: true,
      visible: !isSheet && !isMobile,
      minWidth: 180,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
    },
  ];

  return columns;
};
