import { Mail, Trash, XSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, BaseTableMethods } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import { toaster } from '~/modules/common/toaster';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import DeleteUsers from '~/modules/users/delete-users';
import InviteUsers from '~/modules/users/invite-users';
import type { UsersSearch } from '~/modules/users/table/table-wrapper';
import type { User } from '~/modules/users/types';

type UsersTableBarProps = BaseTableMethods & BaseTableBarProps<User, UsersSearch>;

export const UsersTableBar = ({ total, selected, searchVars, setSearch, columns, setColumns, clearSelection }: UsersTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

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
    setSearch({ role: role === 'all' ? undefined : (role as UsersSearch['role']) });
  };

  const onResetFilters = () => {
    setSearch({ q: '', role: undefined });
    clearSelection();
  };

  const openInviteDialog = () => {
    createDialog(<InviteUsers mode={'email'} dialog />, {
      id: 'invite-users',
      drawerOnMobile: false,
      className: 'w-auto shadow-none border relative z-60 max-w-4xl',
      container: { id: 'invite-users-container', overlay: true },
      title: t('common:invite'),
      titleContent: <UnsavedBadge title={t('common:invite')} />,
      description: `${t('common:invite_users.text')}`,
    });
  };

  const openDeleteDialog = () => {
    createDialog(
      <DeleteUsers
        dialog
        users={selected}
        callback={() => {
          toaster(t('common:success.delete_resources', { resources: t('common:users') }), 'success');
          clearSelection();
        }}
      />,
      {
        className: 'max-w-xl',
        title: t('common:delete'),
        description: t('common:confirm.delete_resource', {
          name: selected.map((u) => u.email).join(', '),
          resource: selected.length > 1 ? t('common:users').toLowerCase() : t('common:user').toLowerCase(),
        }),
      },
    );
  };

  return (
    <>
      <TableBarContainer>
        {/* Table filter bar */}
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selected.length > 0 ? (
              <>
                <Button asChild variant="destructive" onClick={openDeleteDialog} className="relative">
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <Badge context="button">{selected.length}</Badge>
                    <motion.span layoutId="members-filter-bar-icon">
                      <Trash size={16} />
                    </motion.span>
                    <span className="ml-1 max-xs:hidden">{t('common:delete')}</span>
                  </motion.button>
                </Button>

                <Button asChild variant="ghost" onClick={clearSelection}>
                  <motion.button
                    transition={{
                      bounce: 0,
                      duration: 0.2,
                    }}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                  >
                    <XSquare size={16} />
                    <span className="ml-1">{t('common:clear')}</span>{' '}
                  </motion.button>
                </Button>
              </>
            ) : (
              !isFiltered && (
                <Button asChild onClick={() => openInviteDialog()}>
                  <motion.button transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <motion.span layoutId="members-filter-bar-icon">
                      <Mail size={16} />
                    </motion.span>
                    <span className="ml-1">{t('common:invite')}</span>
                  </motion.button>
                </Button>
              )
            )}
            {selected.length === 0 && <TableCount count={total} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch value={q} setQuery={onSearch} />
            <SelectRole value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>

        {/* Columns view */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {/* Focus view */}
        <FocusView iconOnly />
      </TableBarContainer>

      {/* Container for embedded dialog */}
      <div id="invite-users-container" className="empty:hidden" />
    </>
  );
};
