import { config } from 'config';
import { Mailbox, Trash, XSquare } from 'lucide-react';
import { type Dispatch, type SetStateAction, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { actionRequests } from '~/api/general';
import { becomeMemberRequests } from '~/api/organizations';
import ColumnsView, { type ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import { OrganizationContext } from '~/modules/organizations/organization';
import NewsletterForm from '~/modules/system/newsletter-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { Requests } from '~/types';
import type { RequestsSearch } from '.';

interface Props {
  total?: number;
  query?: string;
  selectedRequests: Requests[];
  setQuery: (value?: string) => void;
  isFiltered?: boolean;
  onResetFilters: () => void;
  onResetSelectedRows?: () => void;
  columns: ColumnOrColumnGroup<Requests>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Requests>[]>>;
  sort: RequestsSearch['sort'];
  order: RequestsSearch['order'];
  mode: 'system' | 'organization';
}

function Toolbar({
  total,
  isFiltered,
  query,
  setQuery,
  onResetFilters,
  onResetSelectedRows,
  columns,
  setColumns,
  selectedRequests,
  sort,
  order,
  mode,
}: Props) {
  const { t } = useTranslation();

  const openDeleteDialog = () => {
    console.log('decline requests');
  };

  const openNewsletterSheet = () => {
    sheet(<NewsletterForm sheet />, {
      className: 'sm:max-w-[52rem]',
      title: t('common:newsletter'),
      text: t('common:newsletter.text'),
      id: 'newsletter-form',
    });
  };

  return (
    <>
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedRequests.length > 0 && (
              <>
                <Button onClick={openNewsletterSheet} className="relative">
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedRequests.length}</Badge>
                  <Mailbox size={16} />
                  <span className="ml-1 max-xs:hidden">{t('common:newsletter')}</span>
                </Button>
                <Button variant="destructive" className="relative" onClick={openDeleteDialog}>
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedRequests.length}</Badge>
                  <Trash size={16} />
                  <span className="ml-1 max-lg:hidden">{t('common:decline_request')}</span>
                </Button>
                <Button variant="ghost" onClick={onResetSelectedRows}>
                  <XSquare size={16} />
                  <span className="ml-1">{t('common:clear')}</span>
                </Button>
              </>
            )}
            {selectedRequests.length === 0 && <TableCount count={total} type="request" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={query} setQuery={setQuery} />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <Export
          className="max-lg:hidden"
          filename={`${config.slug}-requests`}
          columns={columns}
          selectedRows={selectedRequests}
          fetchRows={async (limit) => {
            const requestData = { limit, q: query, sort, order };
            const { organization } = useContext(OrganizationContext);
            const { requestsInfo } =
              mode === 'organization' ? await becomeMemberRequests(organization?.id || '', requestData) : await actionRequests(requestData);
            return requestsInfo;
          }}
        />
        <FocusView iconOnly />
      </div>
    </>
  );
}

export default Toolbar;
