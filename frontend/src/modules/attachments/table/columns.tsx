import type { Attachment } from '~/types/common';

import { config } from 'config';
import type { TFunction } from 'i18next';
import { CopyCheckIcon, CopyIcon, Download } from 'lucide-react';
import useDownloader from 'react-use-downloader';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import AttachmentThumb from '~/modules/attachments/attachment-thumb';
import { formatBytes } from '~/modules/attachments/table/helpers';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { dateShort } from '~/utils/date-short';

export const useColumns = (
  t: TFunction<'translation', undefined>,
  isMobile: boolean,
  isAdmin: boolean,
  isSheet: boolean,
  openDialog: (slide: number) => void,
) => {
  const columns: ColumnOrColumnGroup<Attachment>[] = [
    ...(isAdmin ? [CheckboxColumn] : []),
    {
      key: 'thumbnail',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row: { url, filename, contentType }, rowIdx, tabIndex }) => (
        <Button
          variant="cell"
          size="icon"
          className="h-full w-full"
          tabIndex={tabIndex}
          onClick={() => openDialog(rowIdx)}
          aria-label={`View ${filename}`}
        >
          <AttachmentThumb url={url} name={filename} contentType={contentType} />
        </Button>
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
      key: 'url',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { copyToClipboard, copied } = useCopyToClipboard();
        if (!row.url.startsWith('http')) return <span className="text-muted">-</span>;

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
        if (!row.url.startsWith('http')) return <span className="text-muted">-</span>;
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
          {row.filename || '-'}
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
        return (
          <span tabIndex={tabIndex} className="font-light">
            {row.contentType || '-'}
          </span>
        );
      },
    },
    {
      key: 'size',
      name: t('common:size'),
      sortable: false,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <div className="inline-flex items-center gap-1 relative font-light group h-full w-full">{formatBytes(row.size)}</div>,
      width: 100,
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: true,
      visible: !isSheet && !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.createdAt),
      minWidth: 180,
    },
  ];

  return columns;
};
