import type { Control } from 'react-hook-form';
import { BlockNote } from '~/modules/common/blocknote';
import type { BaseUppyFilePanelProps, CommonBlockNoteProps } from '~/modules/common/blocknote/types';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

type Props = {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  name: string;
  disabled?: boolean;
  BaseBlockNoteProps: Omit<CommonBlockNoteProps, 'defaultValue' | 'updateData' | 'filePanel' | 'baseFilePanelProps'> & {
    baseFilePanelProps: BaseUppyFilePanelProps;
  };
} & (
  | {
      label: string;
      required?: boolean;
    }
  | {
      label?: never;
      required?: never;
    }
);

const BlockNoteContent = ({
  control,
  label,
  name,
  required,
  disabled,
  BaseBlockNoteProps: { allowedBlockTypes = ['emoji', 'heading', 'paragraph', 'codeBlock'], ...restBlockNoteProps },
}: Props) => {
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
              <BlockNote type="create" defaultValue={value} allowedBlockTypes={allowedBlockTypes} updateData={onChange} {...restBlockNoteProps} />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

export default BlockNoteContent;
