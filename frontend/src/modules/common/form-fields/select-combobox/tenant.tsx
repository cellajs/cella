import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { type FieldValues, useController, useFormContext } from 'react-hook-form';
import { appConfig } from 'shared';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { tenantsListQueryOptions } from '~/modules/tenants/query';
import { ComboboxSelect, type ComboboxSelectProps } from '~/modules/ui/combobox';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { flattenInfiniteData } from '~/query/basic';
import { useUserStore } from '~/store/user';

type SelectTenantProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  options?: ComboboxSelectProps['options'];
  /** When true, auto-selects and hides the field if only one tenant is available */
  autoHide?: boolean;
};

/**
 * Form field for selecting a tenant.
 * System admins see all tenants (fetched from the API).
 * Regular users see only tenants they belong to (derived from their memberships).
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
  const isSystemAdmin = useUserStore((s) => s.isSystemAdmin);

  // System admins: fetch all tenants from API (includes tenant names)
  const tenantsQuery = useInfiniteQuery({ ...tenantsListQueryOptions({}), enabled: isSystemAdmin });
  const allTenants = flattenInfiniteData<{ id: string; name: string }>(tenantsQuery.data);

  // Fetch user's memberships to derive tenant access
  const membershipsQuery = useQuery(myMembershipsQueryOptions());

  // For regular users: derive unique tenants from memberships (no API access to /tenants)
  const memberTenants = useMemo(() => {
    if (!membershipsQuery.data?.items) return [];
    const tenantMap = new Map<string, string>();
    for (const m of membershipsQuery.data.items) {
      if (!tenantMap.has(m.tenantId)) tenantMap.set(m.tenantId, m.tenantId);
    }
    return Array.from(tenantMap, ([id]) => ({ id, name: id }));
  }, [membershipsQuery.data]);

  // System admins see all tenants with names; regular users see their membership tenants
  // Always exclude the public tenant (reserved for platform-wide content)
  const filteredTenants = (isSystemAdmin ? allTenants : memberTenants).filter(
    (t) => t.id !== appConfig.publicTenant.id,
  );

  const options =
    opts ??
    filteredTenants.map((i) => ({
      value: i.id,
      label: i.name,
    }));

  const hasSingleOption = options.length === 1;

  // Auto-select when only one tenant is available (without marking form dirty)
  const { field } = useController({ control, name });
  const { setValue } = useFormContext();
  useEffect(() => {
    if (hasSingleOption && field.value !== options[0].value) {
      setValue(name, options[0].value as never, { shouldDirty: false });
    }
  }, [hasSingleOption, options, field.value]);

  // When autoHide is enabled, render nothing until data loads (prevents flash),
  // then nothing if ≤1 option, or an animated expand if multiple options
  const isLoading = isSystemAdmin ? tenantsQuery.isLoading : membershipsQuery.isLoading;
  if (autoHide && (isLoading || options.length <= 1)) return null;

  const fieldElement = (
    <FormField
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => (
        <FormItem name={name} aria-disabled={disabled}>
          <FormLabel>
            {label}
            {required && <span className="ml-1 opacity-50">*</span>}
          </FormLabel>

          <ComboboxSelect
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

          <FormMessage />
        </FormItem>
      )}
    />
  );

  if (autoHide) {
    return <div className="animate-in fade-in-0 slide-in-from-top-2 duration-200">{fieldElement}</div>;
  }

  return fieldElement;
};
