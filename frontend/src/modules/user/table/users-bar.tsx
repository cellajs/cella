import { MailIcon, TrashIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '~/api.gen';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import {
  FilterBarActions,
  FilterBarFilters,
  FilterBarSearch,
  TableFilterBar,
} from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { SelectRole } from '~/modules/common/form-fields/select-role';
import { toaster } from '~/modules/common/toaster/service';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { DeleteUsers } from '~/modules/user/delete-users';
import { InviteUsers } from '~/modules/user/invite-users';
import type { UsersRouteSearchParams, UserWithRole } from '~/modules/user/types';
import { useInfiniteQueryTotal } from '~/query/basic';

type UsersTableBarProps = BaseTableBarProps<UserWithRole, UsersRouteSearchParams>;

export const UsersTableBar = ({
  selected,
  queryKey,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
}: UsersTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const total = useInfiniteQueryTotal(queryKey);

  const inviteButtonRef = useRef(null);
  const deleteButtonRef = useRef(null);
  const inviteContainerRef = useRef(null);

  const { q, role } = searchVars;

  const isFiltered = role !== undefined || !!q;

  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };
  // Drop selected Rows on role change
  const onRoleChange = (role?: string) => {
    clearSelection();
    setSearch({ role: role === 'all' ? undefined : (role as UsersRouteSearchParams['role']) });
  };

  const onResetFilters = () => {
    setSearch({ q: '', role: undefined });
    clearSelection();
  };

  const openInviteDialog = () => {
    createDialog(<InviteUsers mode={'email'} dialog />, {
      id: 'invite-users',
      triggerRef: inviteButtonRef,
      drawerOnMobile: false,
      className: 'w-auto shadow-none border relative z-60 max-w-4xl',
      container: { ref: inviteContainerRef, overlay: true },
      title: t('common:invite'),
      titleContent: <UnsavedBadge title={t('common:invite')} />,
      description: `${t('common:invite_users.text')}`,
    });
  };

  const openDeleteDialog = () => {
    const callback = (args: CallbackArgs<User[]>) => {
      if (args.status === 'success') {
        const message =
          args.data.length === 1
            ? t('common:success.delete_resource', { resource: t('common:user') })
            : t('common:success.delete_counted_resources', {
                count: args.data.length,
                resources: t('common:users').toLowerCase(),
              });
        toaster(message, 'success');
      }
      clearSelection();
    };

    createDialog(<DeleteUsers dialog users={selected} callback={callback} />, {
      id: 'delete-users',
      triggerRef: inviteButtonRef,
      className: 'max-w-xl',
      title: t('common:delete'),
      description: t('common:confirm.delete_resource', {
        name: selected.map((u) => u.email).join(', '),
        resource: selected.length > 1 ? t('common:users').toLowerCase() : t('common:user').toLowerCase(),
      }),
    });
  };

  return (
    <>
      <TableBarContainer>
        {/* Table filter bar */}
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
              !isFiltered && (
                <TableBarButton
                  ref={inviteButtonRef}
                  icon={MailIcon}
                  label="common:invite"
                  onClick={() => openInviteDialog()}
                />
              )
            )}
            {selected.length === 0 && (
              <TableCount count={total} label="common:user" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarSearch>
            <TableSearch name="userSearch" value={q} setQuery={onSearch} />
          </FilterBarSearch>
          <FilterBarFilters>
            <SelectRole
              value={role === undefined ? 'all' : role}
              onChange={onRoleChange}
              className="h-10 sm:min-w-32"
            />
          </FilterBarFilters>
        </TableFilterBar>

        {/* Columns view */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {/* Focus view */}
        <FocusView iconOnly />
      </TableBarContainer>

      {/* Container for embedded dialog */}
      <div ref={inviteContainerRef} className="empty:hidden" />
    </>
  );
};
