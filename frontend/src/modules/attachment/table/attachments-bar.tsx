import { InfoIcon, TrashIcon, UploadIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import type { AttachmentsTableProps } from '~/modules/attachment/table/attachments-table';
import { useAttachmentsUploadDialog } from '~/modules/attachment/table/helpers';
import type { AttachmentsRouteSearchParams } from '~/modules/attachment/types';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { useInfiniteQueryTotal } from '~/query/basic/use-infinite-query-total';

type AttachmentsTableBarProps = AttachmentsTableProps & BaseTableBarProps<Attachment, AttachmentsRouteSearchParams>;

export const AttachmentsTableBar = ({
  contextEntity,
  selected,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
  isSheet = false,
  canUpload = true,
  queryKey,
}: AttachmentsTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);
  const { open } = useAttachmentsUploadDialog(contextEntity.tenantId, contextEntity.id);

  const deleteButtonRef = useRef(null);

  const total = useInfiniteQueryTotal(queryKey);

  const { q } = searchVars;

  const isFiltered = !!q;
  const showUpload = canUpload && !isFiltered;

  // Drop selected rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
    clearSelection();
  };

  const openDeleteDialog = () => {
    createDialog(<DeleteAttachments dialog attachments={selected} callback={clearSelection} />, {
      id: 'delete-attachments',
      triggerRef: deleteButtonRef,
      className: 'max-w-xl',
      title: t('c:remove_resource', { resource: t('c:attachments').toLowerCase() }),
      description: t('c:confirm.delete_counted_resource', {
        count: selected.length,
        resource: selected.length > 1 ? t('c:attachments').toLowerCase() : t('c:attachment').toLowerCase(),
      }),
    });
  };

  return (
    <>
      <TableBarContainer searchVars={searchVars} offsetTop={48}>
        {/* Filter bar */}
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selected.length > 0 ? (
              <>
                <TableBarButton
                  ref={deleteButtonRef}
                  variant="destructive"
                  onClick={openDeleteDialog}
                  className="relative"
                  badge={selected.length}
                  icon={TrashIcon}
                  label="c:delete"
                />

                <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquareIcon} label="c:clear" />
              </>
            ) : (
              showUpload && <TableBarButton icon={UploadIcon} label="c:upload" onClick={() => open()} />
            )}
            {selected.length === 0 && (
              <TableCount count={total} label="c:attachment" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>
          <div className="sm:grow" />
          <FilterBarSearch>
            <TableSearch name="attachmentSearch" value={q} setQuery={onSearch} allowOfflineSearch={true} />
          </FilterBarSearch>
        </TableFilterBar>

        {/* Columns view */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {/* Focus view */}
        {!isSheet && <FocusView iconOnly />}
      </TableBarContainer>

      {/* Explainer alert box */}
      {!!total && (
        <AlertBanner id="edit_attachment" variant="plain" className="mb-4" icon={InfoIcon} animate>
          {t('c:edit_attachment.text')}
        </AlertBanner>
      )}
    </>
  );
};
