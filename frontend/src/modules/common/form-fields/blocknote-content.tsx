import { config } from 'config';
import DOMPurify from 'dompurify';
import { Suspense } from 'react';
import type { Control } from 'react-hook-form';
import UppyFilePanel from '~/modules/attachments/upload/blocknote-upload-panel';
import { BlockNote } from '~/modules/common/blocknote';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';

interface Props {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  name: string;
  label: string;
  blocknoteId: string;
  required?: boolean;
  disabled?: boolean;
}

const BlockNoteContent = ({ blocknoteId, control, label, name, required, disabled }: Props) => {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange, value } }) => {
        const sanitizedOnChange = (value: string) => {
          const config = {
            ADD_ATTR: ['colwidth', 'style'], // Allow 'colwidth' and 'style' attributes in the sanitized HTML
          };

          //Sanitized BlockNote content
          const cleanContent = DOMPurify.sanitize(value, config);
          onChange(cleanContent);
        };

        return (
          <FormItem name={name} aria-disabled={disabled}>
            <FormLabel>
              {label}
              {required && <span className="ml-1 opacity-50">*</span>}
            </FormLabel>
            <FormControl>
              <Suspense>
                <BlockNote
                  id={blocknoteId}
                  defaultValue={value}
                  onChange={sanitizedOnChange}
                  updateData={sanitizedOnChange}
                  className="min-h-20 pl-10 pr-6 p-3 border rounded-md"
                  allowedBlockTypes={['emoji', 'heading', 'paragraph', 'codeBlock']}
                  {...(config.has.imado
                    ? {
                        allowedFileBlockTypes: ['image', 'file'],
                        filePanel: (props) => <UppyFilePanel {...props} />,
                      }
                    : ({} as { allowedFileBlockTypes?: never; filePanel?: never }))}
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
