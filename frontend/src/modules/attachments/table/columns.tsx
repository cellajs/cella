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
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import Spinner from '~/modules/common/spinner';
import { getMembersTableCache } from '~/modules/memberships/members-table/helpers';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { dateShort } from '~/utils/date-short';

export const useColumns = (isAdmin: boolean, isSheet: boolean, highDensity: boolean) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);
  const navigate = useNavigate();

  const thumbnailColumn: ColumnOrColumnGroup<Attachment>[] = [
    {
      key: 'thumbnail',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row: { id, url, filename, contentType, groupId }, tabIndex }) => (
        <Link
          id={`attachment-cell-${id}`}
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
              search: (prev) => ({ ...prev, attachmentPreview: id, groupId: groupId || undefined }),
            });
          }}
        >
          <AttachmentThumb url={url} name={filename} contentType={contentType} />
        </Link>
      ),
    },
  ];

  const AttachmentInfoColumns: ColumnOrColumnGroup<Attachment>[] = [
    {
      key: 'storeType',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row }) => {
        const isInCloud = row.url.startsWith(config.publicCDNUrl);
        return (
          <div
            className="flex justify-center items-center h-full w-full"
            data-tooltip="true"
            data-tooltip-content={isInCloud ? t('common:online') : t('common:local_only')}
          >
            {isInCloud ? <Cloud className="text-success" size={16} /> : <CloudOff className="opacity-50" size={16} />}
          </div>
        );
      },
    },
    {
      key: 'url',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { copyToClipboard, copied } = useCopyToClipboard();
        const isInCloud = row.url.startsWith(config.publicCDNUrl);
        if (!isInCloud) return <div className="text-muted text-center w-full">-</div>;

        const shareLink = `${config.backendUrl}/${row.organizationId}/attachments/${row.id}/link`;
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
      },
    },
    {
      key: 'download',
      name: '',
      visible: !isMobile,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { download, isInProgress } = useDownloader();
        if (!row.url.startsWith(config.publicCDNUrl)) return <div className="text-muted text-center w-full">-</div>;
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
            onClick={() => download(row.url, row.filename)}
          >
            {isInProgress ? <Spinner className="w-4 h-4 text-muted" /> : <Download size={16} />}
          </Button>
        );
      },
    },
  ];

  const columns: ColumnOrColumnGroup<Attachment>[] = [
    CheckboxColumn,
    ...thumbnailColumn,
    {
      key: 'name',
      name: t('common:name'),
      editable: true,
      visible: true,
      sortable: false,
      minWidth: 180,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <strong>{row.name || '-'}</strong>,
      ...(isAdmin && {
        renderEditCell: ({ row, onRowChange }) => (
          <Input value={row.name} onChange={(e) => onRowChange({ ...row, name: e.target.value })} autoFocus />
        ),
      }),
    },
    ...AttachmentInfoColumns,
    {
      key: 'filename',
      name: t('common:filename'),
      visible: !isMobile,
      sortable: false,
      minWidth: 140,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <span className="group-hover:underline underline-offset-4 truncate font-light">{row.filename || <span className="text-muted">-</span>}</span>
      ),
    },
    {
      key: 'contentType',
      name: t('common:content_type'),
      sortable: false,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      minWidth: 140,
      renderCell: ({ row }) => {
        if (!row.contentType) return <span className="text-muted">-</span>;
        return <span className="font-light">{row.contentType}</span>;
      },
    },
    {
      key: 'size',
      name: t('common:size'),
      sortable: false,
      visible: !isMobile,
      minWidth: 100,
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
      minWidth: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
    },
    {
      key: 'createdBy',
      name: t('common:created_by'),
      sortable: false,
      visible: false,
      minWidth: highDensity ? null : 120,
      width: highDensity ? 50 : null,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        if (!row.createdBy) return <span className="text-muted">-</span>;

        const items = getMembersTableCache(row.organizationId, 'organization');
        const user = items.find((u) => u.id === row.createdBy);

        return (
          <Link
            id={`attachments-created-by-${row.createdBy}-cell-${row.id}`}
            to="/users/$idOrSlug"
            tabIndex={tabIndex}
            params={{ idOrSlug: user?.slug ?? row.createdBy }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
          >
            {user && <AvatarWrap type="user" className="h-8 w-8" id={user.id} name={user.name} url={user.thumbnailUrl} />}
            <span className="[.high-density_&]:hidden group-hover:underline underline-offset-4 truncate font-medium">
              {user?.name ?? row.createdBy}
            </span>
          </Link>
        );
      },
    },
    {
      key: 'modifiedAt',
      name: t('common:modified'),
      sortable: false,
      visible: false,
      minWidth: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (row.modifiedAt ? dateShort(row.modifiedAt) : <span className="text-muted">-</span>),
    },
    {
      key: 'modifiedBy',
      name: t('common:modified_by'),
      sortable: false,
      visible: false,
      width: highDensity ? 80 : 120,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => {
        if (!row.modifiedBy) return <span className="text-muted">-</span>;

        const items = getMembersTableCache(row.organizationId, 'organization');
        const user = items.find((u) => u.id === row.modifiedBy);

        return (
          <Link
            id={`attachments-modified-by-${row.modifiedBy}-cell-${row.id}`}
            to="/users/$idOrSlug"
            tabIndex={tabIndex}
            params={{ idOrSlug: user?.slug ?? row.modifiedBy }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
          >
            {user && <AvatarWrap type="user" className="h-8 w-8" id={user.id} name={user.name} url={user.thumbnailUrl} />}
            <span className="[.high-density_&]:hidden group-hover:underline underline-offset-4 truncate font-medium">
              {user?.name ?? row.modifiedBy}
            </span>
          </Link>
        );
      },
    },
  ];

  return columns;
};
