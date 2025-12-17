import type { ContextEntityType } from 'config';
import type { FieldValues } from 'react-hook-form';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { useCachedEntityList } from '~/modules/entities/use-cached-entity-list';
import Combobox, { type ComboboxProps } from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

type SelectParentProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  parentType: ContextEntityType;
  options?: ComboboxProps['options'];
};

// Fetch options for the given entity type
function getOptions(entityType: ContextEntityType) {
  const items = useCachedEntityList<{ id: string; name: string; thumbnailUrl?: string | null }>(entityType);

  return items.map((i) => ({
    value: i.id,
    label: i.name,
    url: i.thumbnailUrl ?? undefined,
  }));
}

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
  const options = opts ?? getOptions(parentType);

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
