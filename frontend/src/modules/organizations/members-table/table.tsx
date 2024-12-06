import { onlineManager } from '@tanstack/react-query';
import { forwardRef, useImperativeHandle, useMemo } from 'react';

import type { RowsChangeData } from 'react-data-grid';
import { Trans, useTranslation } from 'react-i18next';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import { queryClient } from '~/lib/router';
import { showToast } from '~/lib/toasts';
import { DataTable } from '~/modules/common/data-table';
import { dialog } from '~/modules/common/dialoger/state';
import { membersKeys } from '~/modules/common/query-client-provider/keys';
import { useMembersUpdateMutation } from '~/modules/common/query-client-provider/mutations/members';
import type { MemberSearch, MembersTableMethods, MembersTableProps } from '~/modules/organizations/members-table';
import { membersQueryOptions } from '~/modules/organizations/members-table/helpers/query-options';
import RemoveMembersForm from '~/modules/organizations/members-table/remove-member-form';
import InviteUsers from '~/modules/users/invite-users';
import type { BaseTableProps, BaseTableQueryVariables, Member } from '~/types/common';

type BaseMembersTableProps = MembersTableProps &
  BaseTableProps<Member> & {
    queryVars: BaseTableQueryVariables<MemberSearch> & { role: MemberSearch['role'] };
  };

const BaseMembersTable = forwardRef<MembersTableMethods, BaseMembersTableProps>(
  ({ entity, tableId, columns, sortColumns, setSortColumns, queryVars }: BaseMembersTableProps, ref) => {
    const { t } = useTranslation();

    const { q, role, sort, order, limit } = queryVars;
    const entityType = entity.entity;
    const organizationId = entity.organizationId || entity.id;

    // Query members
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(
        membersQueryOptions({
          idOrSlug: entity.slug,
          entityType,
          orgIdOrSlug: organizationId,
          q,
          sort,
          order,
          role,
          limit,
        }),
      );

    // Table selection
    const selectedMembers = useMemo(() => {
      return rows.filter((row) => selectedRows.has(row.id));
    }, [selectedRows, rows]);

    const updateMemberMembership = useMembersUpdateMutation();

    // Update rows
    const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
      if (!onlineManager.isOnline()) return showToast(t('common:action.offline.text'), 'warning');

      if (column.key !== 'role') return setRows(changedRows);

      // If role is changed, update membership
      for (const index of indexes) {
        updateMemberMembership.mutateAsync(
          { ...changedRows[index].membership, orgIdOrSlug: organizationId, idOrSlug: entity.slug, entityType },
          {
            onSuccess(data, variables, context) {
              queryClient.getMutationDefaults(membersKeys.update()).onSuccess?.(data, variables, context);
              showToast(t('common:success.update_item', { item: t('common:role') }), 'success');
            },
            onError(error, variables, context) {
              queryClient.getMutationDefaults(membersKeys.update()).onError?.(error, variables, context);
              showToast('Error updating role', 'error');
            },
          },
        );
      }
      setRows(changedRows);
    };

    const openInviteDialog = (container?: HTMLElement | null) => {
      dialog(<InviteUsers entity={entity} mode={null} dialog />, {
        id: `user-invite-${entity.id}`,
        drawerOnMobile: false,
        className: 'w-auto shadow-none relative z-[60] max-w-4xl',
        container,
        containerBackdrop: true,
        containerBackdropClassName: 'z-50',
        title: t('common:invite'),
        description: `${t('common:invite_users.text')}`,
      });
    };

    // pass to dialog same identification witch fetch the query
    const openRemoveDialog = () => {
      dialog(
        <RemoveMembersForm organizationId={organizationId} entityIdOrSlug={entity.slug} entityType={entityType} dialog members={selectedMembers} />,
        {
          className: 'max-w-xl',
          title: t('common:remove_resource', { resource: t('common:member').toLowerCase() }),
          description: (
            <Trans
              i18nKey="common:confirm.remove_members"
              values={{
                entity: entityType,
                emails: selectedMembers.map((member) => member.email).join(', '),
              }}
            />
          ),
        },
      );
    };

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => setSelectedRows(new Set<string>()),
      openRemoveDialog,
      openInviteDialog,
    }));

    return (
      <div id={tableId} data-total-count={totalCount} data-selected={selectedMembers.length}>
        <DataTable<Member>
          {...{
            columns: columns.filter((column) => column.visible),
            rowHeight: 42,
            enableVirtualization: false,
            onRowsChange,
            rows,
            limit,
            totalCount,
            rowKeyGetter: (row) => row.id,
            error,
            isLoading,
            isFetching,
            fetchMore: fetchNextPage,
            isFiltered: role !== undefined || !!q,
            selectedRows,
            onSelectedRowsChange: setSelectedRows,
            sortColumns,
            onSortColumnsChange: setSortColumns,
          }}
        />
      </div>
    );
  },
);

export default BaseMembersTable;
