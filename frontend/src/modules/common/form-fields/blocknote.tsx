import type { MouseEvent } from 'react';
import type { FieldValues } from 'react-hook-form';
import { BlockNote } from '~/modules/common/blocknote/blocknote-editor';
import type { BaseUppyFilePanelProps, CommonBlockNoteProps } from '~/modules/common/blocknote/types';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';

type BaseBlockNoteProps = Omit<CommonBlockNoteProps, 'defaultValue' | 'updateData' | 'filePanel' | 'baseFilePanelProps'> & {
  /** Omit to disable file/media uploads (the editor renders no file panel without it). */
  baseFilePanelProps?: BaseUppyFilePanelProps;
};
export type BlockNoteContentFormFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  baseBlockNoteProps: BaseBlockNoteProps;
  autoFocus?: boolean;
  containerClassName?: string;
};

// A contenteditable is no `htmlFor` target, so a click on the label focuses the editor itself
const focusEditor = (event: MouseEvent<HTMLLabelElement>) =>
  event.currentTarget.closest('[data-slot=form-item]')?.querySelector<HTMLElement>('[contenteditable=true]')?.focus();

export function BlockNoteContentFormField<TFieldValues extends FieldValues>({
  control,
  label,
  name,
  required,
  disabled,
  autoFocus,
  containerClassName,
  baseBlockNoteProps: { baseFilePanelProps, ...restBlockNoteProps },
}: BlockNoteContentFormFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange, value } }) => {
        const editorProps = {
          commitOnEveryChange: true,
          autoFocus,
          editable: !disabled,
          defaultValue: value,
          updateData: onChange,
          ariaLabel: label,
          ...restBlockNoteProps,
        };
        return (
          <FormItem name={name} disabled={disabled} className={containerClassName}>
            {label && (
              <FormLabel required={required} onClick={focusEditor}>
                {label}
              </FormLabel>
            )}
            {/* The filePanel/baseFilePanelProps union needs two branches: a conditional spread widens it */}
            {baseFilePanelProps ? <BlockNote {...editorProps} baseFilePanelProps={baseFilePanelProps} /> : <BlockNote {...editorProps} />}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
