import type { FieldValues } from 'react-hook-form';
import BlockNote from '~/modules/common/blocknote';
import type { BaseUppyFilePanelProps, CommonBlockNoteProps } from '~/modules/common/blocknote/types';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

type BaseBlockNoteProps = Omit<
  CommonBlockNoteProps,
  'defaultValue' | 'updateData' | 'filePanel' | 'baseFilePanelProps'
> & {
  baseFilePanelProps: BaseUppyFilePanelProps;
};
type BlocknoteFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  baseBlockNoteProps: BaseBlockNoteProps;
  autoFocus?: boolean;
};

const BlockNoteContentField = <TFieldValues extends FieldValues>({
  control,
  label,
  name,
  required,
  disabled,
  autoFocus,
  baseBlockNoteProps: {
    excludeBlockTypes = ['bulletListItem', 'checkListItem', 'table', 'notify'],
    ...restBlockNoteProps
  },
}: BlocknoteFieldProps<TFieldValues>) => {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange, value } }) => {
        return (
          <FormItem name={name} aria-disabled={disabled}>
            {typeof label === 'string' && (
              <FormLabel>
                {label}
                {required && <span className="ml-1 opacity-50">*</span>}
              </FormLabel>
            )}
            <FormControl>
              <BlockNote
                type="create"
                autoFocus={autoFocus}
                defaultValue={value}
                excludeBlockTypes={excludeBlockTypes}
                updateData={onChange}
                {...restBlockNoteProps}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

export default BlockNoteContentField;
