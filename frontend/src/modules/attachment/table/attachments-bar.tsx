import { InfoIcon, TrashIcon, UploadIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '~/api.gen';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import type { AttachmentsTableProps } from '~/modules/attachment/table/attachments-table';
import { useAttachmentsUploadDialog } from '~/modules/attachment/table/helpers';
import type { AttachmentsRouteSearchParams } from '~/modules/attachment/types';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';

type AttachmentsTableBarProps = AttachmentsTableProps &
  Omit<BaseTableBarProps<Attachment, AttachmentsRouteSearchParams>, 'queryKey'> & {
    isCompact: boolean;
    setIsCompact: (isCompact: boolean) => void;
    total: number;
  };

export const AttachmentsTableBar = ({
  contextEntity,
  selected,
  searchVars,
  setSearch,
  columns,
  setColumns,
  isCompact,
  setIsCompact,
  clearSelection,
  isSheet = false,
  canUpload = true,
  total,
}: AttachmentsTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);
  const { open } = useAttachmentsUploadDialog(contextEntity.tenantId, contextEntity.id);

  const deleteButtonRef = useRef(null);

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
      title: t('common:remove_resource', { resource: t('common:attachments').toLowerCase() }),
      description: t('common:confirm.delete_counted_resource', {
        count: selected.length,
        resource: selected.length > 1 ? t('common:attachments').toLowerCase() : t('common:attachment').toLowerCase(),
      }),
    });
  };

  return (
    <>
      <TableBarContainer searchVars={searchVars} offsetTop={36}>
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
                  label="common:delete"
                />

                <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquareIcon} label="common:clear" />
              </>
            ) : (
              showUpload && <TableBarButton icon={UploadIcon} label="common:upload" onClick={() => open()} />
            )}
            {selected.length === 0 && (
              <TableCount
                count={total}
                label="common:attachment"
                isFiltered={isFiltered}
                onResetFilters={onResetFilters}
              />
            )}
          </FilterBarActions>
          <div className="sm:grow" />
          <FilterBarSearch>
            <TableSearch name="attachmentSearch" value={q} setQuery={onSearch} allowOfflineSearch={true} />
          </FilterBarSearch>
        </TableFilterBar>

        {/* Columns view */}
        <ColumnsView
          className="max-lg:hidden"
          columns={columns}
          setColumns={setColumns}
          isCompact={isCompact}
          setIsCompact={setIsCompact}
        />

        {/* Focus view */}
        {!isSheet && <FocusView iconOnly />}
      </TableBarContainer>

      {/* Explainer alert box */}
      {!!total && (
        <AlertWrap id="edit_attachment" variant="plain" className="mb-4" icon={InfoIcon} animate>
          {t('common:edit_attachment.text')}
        </AlertWrap>
      )}
    </>
  );
};
