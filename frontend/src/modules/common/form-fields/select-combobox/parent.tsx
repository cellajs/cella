import { useInfiniteQuery } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';
import type { ChannelBase } from 'sdk';
import type { ChannelEntityType } from 'shared';
import { channelListQueriesByType } from '~/list-queries-config';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { ComboboxSelect, type ComboboxSelectProps } from '~/modules/ui/combobox';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';

type SelectParentProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  parentType: ChannelEntityType;
  options?: ComboboxSelectProps['options'];
  onSelect?: (item: ChannelBase) => void;
};

/**
 * Form field for selecting a parent entity.
 */
export const SelectParentFormField = <TFieldValues extends FieldValues>({
  parentType,
  control,
  name,
  label,
  options: opts,
  onSelect,
  required,
  disabled,
}: SelectParentProps<TFieldValues>) => {
  const user = useCurrentUser();

  // Fetch entities using proper query
  const queryFactory = channelListQueriesByType[parentType];
  // biome-ignore lint/suspicious/noExplicitAny: queryFactory returns heterogeneous query options based on parentType
  const query = useInfiniteQuery((queryFactory as any)({ userId: user.id }));
  // biome-ignore lint/suspicious/noExplicitAny: queryFactory is heterogeneous, data shape is unknown
  const items = flattenInfiniteData<ChannelBase>(query.data as any);

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

          <ComboboxSelect
            options={options}
            value={value}
            onChange={(nextValue) => {
              onChange(nextValue);

              const selectedItem = items.find((item) => item.id === nextValue);
              if (selectedItem && onSelect) onSelect(selectedItem);
            }}
            disabled={disabled}
            searchableTrigger
            renderAvatar
            placeholders={{
              trigger: 'c:select_resource',
              search: 'c:placeholder.search',
              notFound: 'c:no_resource_found',
              resource: `c:${parentType}`,
            }}
          />

          <FormMessage />
        </FormItem>
      )}
    />
  );
};
