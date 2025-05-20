import { Link, useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { Cloud, CloudOff, CopyCheckIcon, CopyIcon, Download } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import AttachmentPreview from '~/modules/attachments/attachment-preview';
import { formatBytes } from '~/modules/attachments/table/helpers';
import type { Attachment } from '~/modules/attachments/types';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';
import type { EntityPage } from '~/modules/entities/types';
import { membersKeys } from '~/modules/memberships/query/options';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { findUserFromCache } from '~/modules/users/helpers';
import UserCell from '~/modules/users/user-cell';
import { useUserStore } from '~/store/user';
import { dateShort } from '~/utils/date-short';
import { isCDNUrl } from '~/utils/is-cdn-url';

export const useColumns = (entity: EntityPage, isSheet: boolean, highDensity: boolean) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storeUser = useUserStore((state) => state.user);
  const setTriggerRef = useDialoger((state) => state.setTriggerRef);

  const isMobile = useBreakpoints('max', 'sm', false);
  const isAdmin = entity.membership?.role === 'admin' || storeUser?.role === 'admin';

  const thumbnailColumn: ColumnOrColumnGroup<Attachment>[] = [
    {
      key: 'thumbnail',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row: { id, url, thumbnailUrl, filename, contentType, groupId, convertedUrl }, tabIndex }) => {
        const cellRef = useRef<HTMLAnchorElement | null>(null);

        if (!thumbnailUrl && !convertedUrl)
          return (
            <div className="flex space-x-2 items-center justify-center w-full h-full">
              <AttachmentPreview url={url} name={filename} contentType={contentType} />
            </div>
          );

        return (
          <Link
            to={url}
            ref={cellRef}
            draggable="false"
            tabIndex={tabIndex}
            className="flex space-x-2 items-center justify-center outline-0 ring-0 group w-full h-full"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();

              // Store trigger to bring focus back
              setTriggerRef(id, cellRef);

              navigate({
                to: '.',
                replace: true,
                resetScroll: false,
                search: (prev) => ({ ...prev, attachmentDialogId: id, groupId: groupId || undefined }),
              });
            }}
          >
            <AttachmentPreview url={thumbnailUrl ?? url} name={filename} contentType={contentType} />
          </Link>
        );
      },
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
        const isInCloud = isCDNUrl(row.url);
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
        const isInCloud = isCDNUrl(row.url);
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
        if (!isCDNUrl(row.url)) return <div className="text-muted text-center w-full">-</div>;
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
            {isInProgress ? <Spinner className="w-4 h-4 text-foreground/80" noDelay /> : <Download size={16} />}
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
      renderCell: ({ row }) => <span className="font-medium">{row.name || '-'}</span>,
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

        const queryKey = [...membersKeys.table.base(), { entityType: entity.entity, orgIdOrSlug: row.organizationId }];
        const user = findUserFromCache(queryKey, row.createdBy);

        if (!user) return <span>{row.createdBy}</span>;

        return <UserCell user={user} tabIndex={tabIndex} />;
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

        const queryKey = [...membersKeys.table.base(), { entityType: entity.entity, orgIdOrSlug: row.organizationId }];
        const user = findUserFromCache(queryKey, row.modifiedBy);

        if (!user) return <span>{row.modifiedBy}</span>;

        return <UserCell user={user} tabIndex={tabIndex} />;
      },
    },
  ];

  return columns;
};
