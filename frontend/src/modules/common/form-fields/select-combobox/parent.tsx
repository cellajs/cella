import { useInfiniteQuery } from '@tanstack/react-query';
import type { FieldValues } from 'react-hook-form';
import type { ChannelBase } from 'sdk';
import type { ChannelEntityType } from 'shared';
import { getChannelListQuery } from '~/lib/entity-modules';
import { ComboboxFormField, type ComboboxSelectProps } from '~/modules/common/form-fields/select-combobox/combobox-select';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { getQueryItems } from '~/query/basic/mutate-query';

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
  // No user filter: a list endpoint answers with the caller's channels, and `relatableUserId` would narrow those to their own memberships
  const listQuery = getChannelListQuery(parentType);
  if (!listQuery) throw new Error(`Channel '${parentType}' declares no list query to pick a parent from`);
  const query = useInfiniteQuery({ ...listQuery({ organizationId }), enabled });
  const items = query.data ? getQueryItems(query.data) : [];

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
