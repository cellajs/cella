import { config } from 'config';
import type { Control } from 'react-hook-form';
import UppyFilePanel from '~/modules/attachments/upload/blocknote-upload-panel';
import { BlockNote } from '~/modules/common/blocknote';
import type { CommonBlockNoteProps } from '~/modules/common/blocknote/types';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

type Props = {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  name: string;
  disabled?: boolean;
  BaseBlockNoteProps: Omit<CommonBlockNoteProps, 'defaultValue' | 'updateData'>;
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
  BaseBlockNoteProps: {
    allowedBlockTypes = ['emoji', 'heading', 'paragraph', 'codeBlock'],
    allowedFileBlockTypes = config.has.s3 ? ['image', 'file'] : undefined,
    filePanel = config.has.s3 ? (props) => <UppyFilePanel {...props} /> : (null as never),
    ...blockNoteProps
  },
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
              <BlockNote
                type="create"
                defaultValue={value}
                allowedBlockTypes={allowedBlockTypes}
                allowedFileBlockTypes={allowedFileBlockTypes}
                filePanel={filePanel}
                updateData={onChange}
                {...blockNoteProps}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

export default BlockNoteContent;
