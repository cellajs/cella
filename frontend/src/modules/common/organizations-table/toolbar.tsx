import { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { Table } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import { useUserStore } from "~/store/user";
import { Organization } from "~/types";
import { dialog } from "../dialoger/state";
import { Button } from "~/modules/ui/button";
import CountAndLoading from "../data-table/count-and-loading";
import { Input } from "~/modules/ui/input";
import { DataTableViewOptions } from "../data-table/options";
import CreateOrganizationForm from "~/modules/organizations/create-organization-form";


interface Props {
    table: Table<Organization>;
    filter?: string;
    queryResult: UseInfiniteQueryResult<
        InfiniteData<
            {
                items: Organization[];
                total: number;
            },
            unknown
        >,
        Error
    >;
    rowSelection: Record<string, boolean>;
    isFiltered?: boolean;
    callback: (organization: Organization, action: 'create' | 'update' | 'delete') => void;
}

function Toolbar({
    table,
    queryResult,
    // rowSelection,
    isFiltered,
    callback,
}: Props) {
    const { t } = useTranslation();
    const user = useUserStore((state) => state.user);
    // const [, setOpen] = useState(false);

    return (
        <div className="items-center justify-between sm:flex">
            <div className="flex items-center space-x-2">
                {/* {Object.keys(rowSelection).length > 0 ? (
            <Button variant="destructive" className="relative" onClick={() => setOpen(true)}>
              <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
                <span className="text-xs font-medium text-white">{Object.keys(rowSelection).length}</span>
              </div>
              {t('action.remove', {
                defaultValue: 'Remove',
              })}
            </Button>
          ) : (
            user.role === 'ADMIN' && <SheetMenuCreate show entityType="organizations" text="Create" />
          )} */}
                {user.role === 'ADMIN' && (
                    <Button
                        onClick={() => {
                            dialog(<CreateOrganizationForm callback={(organization) => callback(organization, 'create')} dialog />, {
                                className: 'sm:max-w-xl',
                                title: t('label.create_organization', {
                                    defaultValue: 'Create organization',
                                }),
                            });
                        }}
                    >
                        {t('action.create', {
                            defaultValue: 'Create',
                        })}
                    </Button>
                )}
                <CountAndLoading
                    count={queryResult.data?.pages[0].total}
                    isLoading={queryResult.isFetching}
                    singular={t('label.singular_organization', {
                        defaultValue: 'organization',
                    })}
                    plural={t('label.plural_organization', {
                        defaultValue: 'organizations',
                    })}
                    isFiltered={isFiltered}
                    onResetFilters={() => {
                        table.resetColumnFilters();
                        table.resetRowSelection();
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