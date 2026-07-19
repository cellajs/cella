import type { FieldValues } from 'react-hook-form';
import { BlockNote } from '~/modules/common/blocknote/block-note-editor';
import type { BaseUppyFilePanelProps, CommonBlockNoteProps } from '~/modules/common/blocknote/types';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';

type BaseBlockNoteProps = Omit<
  CommonBlockNoteProps,
  'defaultValue' | 'updateData' | 'filePanel' | 'baseFilePanelProps'
> & {
  /** Omit to disable file/media uploads (the editor renders no file panel without it). */
  baseFilePanelProps?: BaseUppyFilePanelProps;
};
type BlocknoteFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  baseBlockNoteProps: BaseBlockNoteProps;
  autoFocus?: boolean;
  containerClassName?: string;
};

/**
 * A form field component that integrates the BlockNote editor with react-hook-form.
 */
const BlockNoteContentFormField = <TFieldValues extends FieldValues>({
  control,
  label,
  name,
  required,
  disabled,
  autoFocus,
  containerClassName,
  baseBlockNoteProps: { excludeBlockTypes, baseFilePanelProps, ...restBlockNoteProps },
}: BlocknoteFieldProps<TFieldValues>) => {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange, value } }) => {
        const editorProps = {
          commitOnEveryChange: true,
          autoFocus,
          defaultValue: value,
          excludeBlockTypes,
          updateData: onChange,
          ...restBlockNoteProps,
        };
        return (
          <FormItem name={name} aria-disabled={disabled} className={containerClassName}>
            {typeof label === 'string' && (
              <FormLabel>
                {label}
                {required && <span className="ml-1 opacity-50">*</span>}
              </FormLabel>
            )}
            {/* Explicit branch: the editor's filePanel/baseFilePanelProps union cannot be
                satisfied through a conditional spread (TS widens it to an optional prop). */}
            {baseFilePanelProps ? (
              <BlockNote {...editorProps} baseFilePanelProps={baseFilePanelProps} />
            ) : (
              <BlockNote {...editorProps} />
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

export { BlockNoteContentFormField };
