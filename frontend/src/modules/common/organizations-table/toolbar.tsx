import { useTranslation } from "react-i18next";
import { useUserStore } from "~/store/user";
import { Organization } from "~/types";
import { dialog } from "../dialoger/state";
import { Button } from "~/modules/ui/button";
import CountAndLoading from "../data-table/count-and-loading";
import { Input } from "~/modules/ui/input";
import CreateOrganizationForm from "~/modules/organizations/create-organization-form";


interface Props {
    total?: number;
    query?: string;
    setQuery?: (value: string) => void;
    isFiltered?: boolean;
    isLoading?: boolean;
    onResetFilters?: () => void;
    callback: (organization: Organization, action: 'create' | 'update' | 'delete') => void;
    refetch?: () => void;
    setSelectedRows: (value: Set<string>) => void;
}

function Toolbar({
    total,
    isFiltered,
    query,
    setQuery,
    isLoading,
    callback,
    onResetFilters,
    setSelectedRows,
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
                    count={total}
                    isLoading={isLoading}
                    singular={t('label.singular_organization', {
                        defaultValue: 'organization',
                    })}
                    plural={t('label.plural_organization', {
                        defaultValue: 'organizations',
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
            </div>
        </div>
    );
}

export default Toolbar;