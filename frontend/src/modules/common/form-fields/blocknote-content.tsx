import { config } from 'config';
import { Suspense } from 'react';
import type { Control } from 'react-hook-form';
import UppyFilePanel from '~/modules/attachments/upload/blocknote-upload-panel';
import { BlockNoteCreate, type BlockNoteCreateProps } from '~/modules/common/blocknote/create';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

type Props = {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  name: string;
  disabled?: boolean;
  blocknoteProps: Omit<BlockNoteCreateProps, 'defaultValue' | 'onChange'>;
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
  blocknoteProps: {
    allowedBlockTypes = ['emoji', 'heading', 'paragraph', 'codeBlock'],
    allowedFileBlockTypes = config.has.imado ? ['image', 'file'] : undefined,
    filePanel = config.has.imado ? (props) => <UppyFilePanel {...props} /> : (null as never),
    ...restBlocknoteProps
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
              <Suspense>
                <BlockNoteCreate
                  {...restBlocknoteProps}
                  defaultValue={value}
                  onChange={onChange}
                  allowedBlockTypes={allowedBlockTypes}
                  allowedFileBlockTypes={allowedFileBlockTypes}
                  filePanel={filePanel}
                />
              </Suspense>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

export default BlockNoteContent;
