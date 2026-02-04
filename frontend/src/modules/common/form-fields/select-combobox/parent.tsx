import { useInfiniteQuery } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';
import type { ContextEntityType } from 'shared';
import { ContextEntityBase } from '~/api.gen';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import Combobox, { type ComboboxProps } from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { flattenInfiniteData } from '~/query/basic';
import { useUserStore } from '~/store/user';

type SelectParentProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  parentType: ContextEntityType;
  options?: ComboboxProps['options'];
};

/**
 * Form field for selecting a parent entity.
 */
const SelectParentFormField = <TFieldValues extends FieldValues>({
  parentType,
  control,
  name,
  label,
  options: opts,
  required,
  disabled,
}: SelectParentProps<TFieldValues>) => {
  const { user } = useUserStore();

  // Fetch entities using proper query
  const queryFactory = getContextEntityTypeToListQueries()[parentType];
  const query = useInfiniteQuery(queryFactory({ userId: user.id }));
  const items = flattenInfiniteData<ContextEntityBase>(query.data);

  const options =
    opts ??
    items.map((i) => ({
      value: i.id,
      label: i.name,
      url: i.thumbnailUrl ?? undefined,
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
              renderAvatar
              placeholders={{
                trigger: 'common:select_resource',
                search: 'common:placeholder.search',
                notFound: 'common:no_resource_found',
                resource: `common:${parentType}`,
              }}
            />
          </FormControl>

          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SelectParentFormField;
