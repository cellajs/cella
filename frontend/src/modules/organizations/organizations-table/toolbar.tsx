import { config } from 'config';
import { Mailbox, Plus, Trash, XSquare } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getOrganizations } from '~/api/organizations';
import ColumnsView, { type ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import DeleteOrganizations from '~/modules/organizations/delete-organizations';
import NewsletterForm from '~/modules/system/newsletter-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types';
import type { OrganizationsSearch } from '.';

interface Props {
  total?: number;
  query?: string;
  selectedOrganizations: Organization[];
  setQuery: (value?: string) => void;
  isFiltered?: boolean;
  onResetFilters: () => void;
  onResetSelectedRows?: () => void;
  callback: (organizations: Organization[], action: 'create' | 'update' | 'delete') => void;
  columns: ColumnOrColumnGroup<Organization>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Organization>[]>>;
  sort: OrganizationsSearch['sort'];
  order: OrganizationsSearch['order'];
}

function Toolbar({
  total,
  isFiltered,
  query,
  setQuery,
  callback,
  onResetFilters,
  onResetSelectedRows,
  columns,
  setColumns,
  selectedOrganizations,
  sort,
  order,
}: Props) {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  const openDeleteDialog = () => {
    dialog(
      <DeleteOrganizations
        organizations={selectedOrganizations}
        callback={(organizations) => {
          callback(organizations, 'delete');
          toast.success(t('common:success.delete_organizations'));
        }}
        dialog
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('common:delete'),
        text: t('common:confirm.delete_organizations'),
      },
    );
  };

  const openNewsletterSheet = () => {
    sheet(<NewsletterForm sheet />, {
      className: 'sm:max-w-[64rem]',
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
            {selectedOrganizations.length > 0 ? (
              <>
                <Button onClick={openNewsletterSheet} className="relative">
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedOrganizations.length}</Badge>
                  <Mailbox size={16} />
                  <span className="ml-1 max-xs:hidden">{t('common:newsletter')}</span>
                </Button>
                <Button variant="destructive" className="relative" onClick={openDeleteDialog}>
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedOrganizations.length}</Badge>
                  <Trash size={16} />
                  <span className="ml-1 max-lg:hidden">{t('common:remove')}</span>
                </Button>
                <Button variant="ghost" onClick={onResetSelectedRows}>
                  <XSquare size={16} />
                  <span className="ml-1">{t('common:clear')}</span>
                </Button>
              </>
            ) : (
              !isFiltered &&
              user.role === 'ADMIN' && (
                <Button
                  onClick={() => {
                    dialog(<CreateOrganizationForm callback={(organization) => callback([organization], 'create')} dialog />, {
                      className: 'md:max-w-xl',
                      title: t('common:create_organization'),
                    });
                  }}
                >
                  <Plus size={16} />
                  <span className="ml-1">{t('common:create')}</span>
                </Button>
              )
            )}
            {selectedOrganizations.length === 0 && (
              <TableCount count={total} type="organization" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={query} setQuery={setQuery} />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <Export
          className="max-lg:hidden"
          filename={`${config.slug}-organizations`}
          columns={columns}
          selectedRows={selectedOrganizations}
          fetchRows={async (limit) => {
            const { items } = await getOrganizations({ limit, q: query, sort, order });
            return items;
          }}
        />
        <FocusView iconOnly />
      </div>
    </>
  );
}

export default Toolbar;
