import { useInfiniteQuery } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';
import type { ChannelBase } from 'sdk';
import type { ChannelEntityType } from 'shared';
import { getChannelListQuery } from '~/lib/entity-modules';
import { ComboboxFormField, type ComboboxSelectProps } from '~/modules/common/form-fields/select-combobox/combobox-select';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';

type SelectParentFormFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  parentType: ChannelEntityType;
  /** Restrict the offered parents to one organization (e.g. sub-channels of the picked org). */
  organizationId?: string;
  options?: ComboboxSelectProps['options'];
  onSelect?: (item: ChannelBase) => void;
  /** Offers a clear button on a picked parent, for a field that may stay empty; clearing sets an empty string. */
  clearable?: boolean;
};

/** Channels the user can pick as a parent; shares its cache with the picker's own list query. */
export function useParentChannels(parentType: ChannelEntityType, organizationId?: string, enabled = true) {
  const user = useCurrentUser();

  const queryFactory = getChannelListQuery(parentType);
  // biome-ignore lint/suspicious/noExplicitAny: queryFactory returns heterogeneous query options based on parentType
  const query = useInfiniteQuery({ ...(queryFactory as any)({ userId: user.id, organizationId }), enabled });
  // biome-ignore lint/suspicious/noExplicitAny: queryFactory is heterogeneous, data shape is unknown
  const items = flattenInfiniteData<ChannelBase>(query.data as any);

  return { items, isLoaded: query.isSuccess };
}

export function SelectParentFormField<TFieldValues extends FieldValues>({
  parentType,
  organizationId,
  control,
  name,
  label,
  options: passedOptions,
  onSelect,
  required,
  disabled,
  clearable,
}: SelectParentFormFieldProps<TFieldValues>) {
  const { items } = useParentChannels(parentType, organizationId, !disabled);

  const options = passedOptions ?? items.map((item) => ({ value: item.id, label: item.name, url: item.thumbnailUrl }));

  return (
    <ComboboxFormField
      control={control}
      name={name}
      label={label}
      required={required}
      disabled={disabled}
      options={options}
      onSelect={(nextValue) => {
        const selectedItem = items.find((item) => item.id === nextValue);
        if (selectedItem) onSelect?.(selectedItem);
      }}
      clearable={clearable}
      showAvatar
      placeholders={{ trigger: 'c:select_resource', resource: `c:${parentType}` }}
    />
  );
}
