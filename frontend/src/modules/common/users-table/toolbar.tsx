import { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { Table } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import { useUserStore } from "~/store/user";
import { dialog } from "../dialoger/state";
import { Button } from "~/modules/ui/button";
import CountAndLoading from "../data-table/count-and-loading";
import { Input } from "~/modules/ui/input";
import { DataTableViewOptions } from "../data-table/options";
import { User } from "~/types";
import { GetUsersParams } from "~/api/users";
import { useState } from "react";
import InviteUsersForm from "~/modules/users/invite-users-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/modules/ui/select";
import { X } from "lucide-react";

interface Props {
    table: Table<User>;
    queryResult: UseInfiniteQueryResult<
        InfiniteData<
            {
                items: User[];
                total: number;
            },
            unknown
        >,
        Error
    >;
    rowSelection: Record<string, boolean>;
    isFiltered?: boolean;
    role: GetUsersParams['role'];
    setRole: React.Dispatch<React.SetStateAction<GetUsersParams['role']>>;
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
        key: 'user',
        value: 'User',
    },
];

function Toolbar({
    table,
    queryResult,
    rowSelection,
    isFiltered,
    role,
    setRole,
}: Props) {
    const { t } = useTranslation();
    const [, setOpen] = useState(false);
    const user = useUserStore((state) => state.user);

    const openInviteDialog = () => {
        dialog(<InviteUsersForm dialog />, {
            drawerOnMobile: false,
            className: 'max-w-xl',
            title: t('label.invite', {
                defaultValue: 'Invite',
            }),
            description: t('description.invite_users', {
                defaultValue: 'Invited users will receive an email with an invitation link.',
            }),
        });
    };

    return (
        <div className="items-center justify-between sm:flex">
            <div className="flex items-center space-x-2">
                {Object.keys(rowSelection).length > 0 ? (
                    <Button variant="destructive" className="relative" onClick={() => setOpen(true)}>
                        <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
                            <span className="text-xs font-medium text-white">{Object.keys(rowSelection).length}</span>
                        </div>
                        {t('action.remove', {
                            defaultValue: 'Remove',
                        })}
                    </Button>
                ) : (
                    !isFiltered && (
                        <>
                            {user.role === 'ADMIN' && (
                                <Button onClick={openInviteDialog}>
                                    {t('action.invite', {
                                        defaultValue: 'Invite',
                                    })}
                                </Button>
                            )}
                        </>
                    )
                )}
                <CountAndLoading
                    count={queryResult.data?.pages[0].total}
                    isLoading={queryResult.isFetching}
                    singular={t('label.singular_user', {
                        defaultValue: 'user',
                    })}
                    plural={t('label.plural_users', {
                        defaultValue: 'users',
                    })}
                    isFiltered={isFiltered}
                    onResetFilters={() => {
                        table.resetColumnFilters();
                        table.resetRowSelection();
                        setRole(undefined);
                    }}
                />
            </div>
            <div className="mt-2 flex items-center space-x-2 sm:mt-0">
                <Input
                    placeholder={t('placeholder.search', {
                        defaultValue: 'Search ...',
                    })}
                    value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
                    onChange={(event) => {
                        table.resetRowSelection();
                        table.getColumn('name')?.setFilterValue(event.target.value);
                    }}
                    className="h-10 w-[150px] lg:w-[250px]"
                />
                <Select
                    onValueChange={(role) => {
                        table.resetRowSelection();
                        setRole(role === 'all' ? undefined : (role as GetUsersParams['role']));
                    }}
                    value={role === undefined ? 'all' : role}
                >
                    <SelectTrigger className="h-10 w-[150px]">
                        <SelectValue placeholder="Select a role" className="capitalize" />
                    </SelectTrigger>
                    <SelectContent>
                        {items.map(({ key, value }) => (
                            <SelectItem key={key} value={key} className="capitalize">
                                {value}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <DataTableViewOptions table={table} />

                {isFiltered && (
                    <Button variant="ghost" onClick={() => table.resetColumnFilters()} className="h-10 px-2 lg:px-3">
                        {t('action.reset', {
                            defaultValue: 'Reset',
                        })}
                        <X className="ml-2 h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}

export default Toolbar;