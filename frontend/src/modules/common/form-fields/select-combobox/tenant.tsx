import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { FieldValues } from 'react-hook-form';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { tenantsListQueryOptions } from '~/modules/tenants/query';
import { Combobox, type ComboboxProps } from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { flattenInfiniteData } from '~/query/basic';
import { useUserStore } from '~/store/user';

type SelectTenantProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  options?: ComboboxProps['options'];
};

/**
 * Form field for selecting a tenant.
 * Filters tenants to only show those where the user has a membership (unless system admin).
 */
export const SelectTenantFormField = <TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options: opts,
  required,
  disabled,
}: SelectTenantProps<TFieldValues>) => {
  const systemRole = useUserStore((s) => s.systemRole);
  const isSystemAdmin = systemRole === 'admin';

  // Fetch all tenants
  const tenantsQuery = useInfiniteQuery(tenantsListQueryOptions({}));
  const allTenants = flattenInfiniteData<{ id: string; name: string }>(tenantsQuery.data);

  // Fetch user's memberships to filter tenants
  const membershipsQuery = useQuery(myMembershipsQueryOptions());
  const memberTenantIds = useMemo(() => {
    if (!membershipsQuery.data?.items) return new Set<string>();
    return new Set(membershipsQuery.data.items.map((m) => m.tenantId));
  }, [membershipsQuery.data]);

  // Filter tenants: system admins see all, others only see their membership tenants
  const filteredTenants = useMemo(() => {
    if (isSystemAdmin) return allTenants;
    return allTenants.filter((t) => memberTenantIds.has(t.id));
  }, [allTenants, memberTenantIds, isSystemAdmin]);

  const options =
    opts ??
    filteredTenants.map((i) => ({
      value: i.id,
      label: i.name,
    }));

  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => (
        <FormItem name={name} aria-disabled={disabled}>
          <FormLabel>
            {label}
            {required && <span className="ml-1 opacity-50">*</span>}
          </FormLabel>

          <FormControl>
            <Combobox
              options={options}
              value={value}
              onChange={onChange}
              disabled={disabled}
              placeholders={{
                trigger: 'common:select_resource',
                search: 'common:placeholder.search',
                notFound: 'common:no_resource_found',
                //  TODO this trnsllation doesnt exist or something broken here?
                resource: 'common:tenant',
              }}
            />
          </FormControl>
          {/* TODO validation when left blank shows Too small: expected string to have >=1 characters. Can we show instread of string the label translation? THis can also be valuable in other location so perhaps this needs to be a util or embedded in the FormMessage or validation logic itself?  */}
          {/* TODO: the validation in password form shows a red border when validation throws an error, can we do that here too? */}

          <FormMessage />
        </FormItem>
      )}
    />
  );
};
