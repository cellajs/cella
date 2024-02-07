import { InfiniteData, UseSuspenseInfiniteQueryResult } from "@tanstack/react-query";
import { Table } from "@tanstack/react-table";
import { useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { GetMembersParams } from "~/api/organizations";
import { useUserStore } from "~/store/user";
import { Member, Organization } from "~/types";
import { dialog } from "../dialoger/state";
import InviteUsersForm from "~/modules/users/invite-users-form";
import RemoveMembersForm from "./remove-member-form";
import { Button } from "~/modules/ui/button";
import CountAndLoading from "../data-table/count-and-loading";
import { Input } from "~/modules/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/modules/ui/select";
import { DataTableViewOptions } from "../data-table/options";
import { cn } from "~/lib/utils";

interface Props {
    table: Table<Member>;
    queryResult: UseSuspenseInfiniteQueryResult<
        InfiniteData<
            {
                items: Member[];
                total: number;
            },
            unknown
        >,
        Error
    >;
    organization: Organization;
    role: GetMembersParams['role'];
    rowSelection: Record<string, boolean>;
    callback: (member?: Member) => void;
    isFiltered?: boolean;
    setRole: React.Dispatch<React.SetStateAction<GetMembersParams['role']>>;
}

const items = [
    {
        key: 'all',
        value: 'All',
    },
    {
        key: 'admin',
        value: 'Admin',
    },
    {
        key: 'member',
        value: 'Member',
    },
];

function Toolbar({
    table,
    queryResult,
    role,
    setRole,
    organization,
    callback,
    rowSelection,
    isFiltered,
}: Props) {
    const { t } = useTranslation();
    const user = useUserStore((state) => state.user);
    const members = useMemo(() => Object.keys(rowSelection).map((id) => table.getRow(id).original), [rowSelection, table]);

    const openInviteDialog = () => {
        dialog(<InviteUsersForm organization={organization} callback={callback} dialog />, {
            drawerOnMobile: false,
            className: 'max-w-xl',
            title: t('label.invite', {
                defaultValue: 'Invite',
            }),
            description: t('description.invite_members', {
                defaultValue: 'Invited members will receive an email with invitation link.',
            }),
        });
    };

    const openRemoveDialog = () => {
        dialog(
            <RemoveMembersForm
                organization={organization}
                dialog
                callback={() => {
                    table.resetRowSelection();
                    queryResult.refetch();
                }}
                members={members}
            />,
            {
                className: 'sm:max-w-xl',
                title: t('label.remove_member', {
                    defaultValue: 'Remove member',
                }),
                description: (
                    <Trans
                        i18nKey="question.are_you_sure_to_remove_member"
                        values={{
                            emails: members.map((member) => member.email).join(', '),
                        }}
                        defaults="Are you sure you want to remove <strong>{{emails}}</strong> from the organization?"
                    />
                ),
            },
        );
    };

    return (
        <div className="items-center justify-between sm:flex">
            <div className="flex items-center space-x-2">
                {Object.keys(rowSelection).length > 0 ? (
                    <>
                        <Button variant="destructive" className="relative" onClick={openRemoveDialog}>
                            <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
                                <span className="text-xs font-medium text-white">{Object.keys(rowSelection).length}</span>
                            </div>
                            {t('action.remove', {
                                defaultValue: 'Remove',
                            })}
                        </Button>
                        <Button variant="secondary" onClick={openRemoveDialog}>
                            {t('action.clear', {
                                defaultValue: 'Clear',
                            })}
                        </Button>
                    </>
                ) : (
                    !isFiltered && (
                        <>
                            {(user.role === 'ADMIN' || organization.userRole === 'ADMIN') && (
                                <Button onClick={openInviteDialog}>
                                    {t('action.invite', {
                                        defaultValue: 'Invite',
                                    })}
                                </Button>
                            )}
                        </>
                    )
                )}
                {Object.keys(rowSelection).length === 0 && (
                    <CountAndLoading
                        count={queryResult.data?.pages[0].total}
                        isLoading={queryResult.isFetching}
                        singular={t('label.singular_member', {
                            defaultValue: 'member',
                        })}
                        plural={t('label.plural_member', {
                            defaultValue: 'members',
                        })}
                        isFiltered={isFiltered}
                        onResetFilters={() => {
                            table.resetColumnFilters();
                            table.resetRowSelection();
                            setRole(undefined);
                        }}
                    />
                )}
            </div>
            <div className="mt-2 flex items-center space-x-2 sm:mt-0">
                <Input
                    placeholder={t('placeholder.search', {
                        defaultValue: 'Search ...',
                    })}
                    value={(table.getColumn('email')?.getFilterValue() as string) ?? ''}
                    onChange={(event) => {
                        table.resetRowSelection();
                        table.getColumn('email')?.setFilterValue(event.target.value);
                    }}
                    className="h-10 w-[150px] lg:w-[250px]"
                />
                <Select
                    onValueChange={(role) => {
                        table.resetRowSelection();
                        setRole(role === 'all' ? undefined : (role as GetMembersParams['role']));
                    }}
                    value={role === undefined ? 'all' : role}
                >
                    <SelectTrigger className={cn('h-10 w-[125px]', role !== undefined && 'text-primary')}>
                        <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                        {items.map(({ key, value }) => (
                            <SelectItem key={key} value={key}>
                                {value}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <DataTableViewOptions table={table} />
                {/* {isFiltered && (
            <Button
              variant="ghost"
              onClick={() => table.resetColumnFilters()}
              className="h-10 px-2 lg:px-3"
            >
              {t('action.reset', {
                defaultValue: 'Reset',
              })}
              <X className="ml-2 h-4 w-4" />
            </Button>
          )} */}
            </div>
        </div>
    );
}

export default Toolbar;