import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { type FieldValues, useController } from 'react-hook-form';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { tenantsListQueryOptions } from '~/modules/tenants/query';
import { Combobox, type ComboboxProps } from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { flattenInfiniteData } from '~/query/basic';
import { useUserStore } from '~/store/user';

type SelectTenantProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  options?: ComboboxProps['options'];
  /** When true, auto-selects and hides the field if only one tenant is available */
  autoHide?: boolean;
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
  autoHide,
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

  const hasSingleOption = options.length === 1;

  // Auto-select when only one tenant is available
  const { field } = useController({ control, name });
  useEffect(() => {
    if (hasSingleOption && field.value !== options[0].value) {
      field.onChange(options[0].value);
    }
  }, [hasSingleOption, options, field]);

  // Hide the field when autoHide is enabled and only one tenant exists
  if (autoHide && hasSingleOption) return null;

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
                resource: 'common:tenant',
              }}
            />
          </FormControl>

          <FormMessage />
        </FormItem>
      )}
    />
  );
};
