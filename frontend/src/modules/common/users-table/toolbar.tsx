import { useTranslation } from "react-i18next";
import { useUserStore } from "~/store/user";
import { dialog } from "../dialoger/state";
import { Button } from "~/modules/ui/button";
import CountAndLoading from "../data-table/count-and-loading";
import { Input } from "~/modules/ui/input";
import { GetUsersParams } from "~/api/users";
import { useState } from "react";
import InviteUsersForm from "~/modules/users/invite-users-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/modules/ui/select";
import { User } from "~/types";

interface Props {
    rows: User[];
    total?: number;
    query?: string;
    setQuery?: (value: string) => void;
    isFiltered?: boolean;
    role: GetUsersParams['role'];
    setRole: React.Dispatch<React.SetStateAction<GetUsersParams['role']>>;
    selectedRows: Set<string>;
    onResetFilters?: () => void;
    isLoading?: boolean;
    refetch?: () => void;
    setSelectedRows: (value: Set<string>) => void;
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
    selectedRows,
    isFiltered,
    total,
    isLoading,
    role,
    setRole,
    onResetFilters,
    query,
    setQuery,
    setSelectedRows,
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
                {selectedRows.size > 0 ? (
                    <Button variant="destructive" className="relative" onClick={() => setOpen(true)}>
                        <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
                            <span className="text-xs font-medium text-white">{selectedRows.size}</span>
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
                    count={total}
                    isLoading={isLoading}
                    singular={t('label.singular_user', {
                        defaultValue: 'user',
                    })}
                    plural={t('label.plural_users', {
                        defaultValue: 'users',
                    })}
                    isFiltered={isFiltered}
                    onResetFilters={onResetFilters}
                />
            </div>
            <div className="mt-2 flex items-center space-x-2 sm:mt-0">
                <Input
                    placeholder={t('placeholder.search', {
                        defaultValue: 'Search ...',
                    })}
                    value={query ?? ''}
                    onChange={(event) => {
                        setSelectedRows(new Set());
                        setQuery?.(event.target.value);
                    }}
                    className="h-10 w-[150px] lg:w-[250px]"
                />
                <Select
                    onValueChange={(role) => {
                        setSelectedRows(new Set());
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
            </div>
        </div>
    );
}

export default Toolbar;