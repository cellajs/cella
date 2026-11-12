import type { MouseEvent, RefObject } from 'react';
import type { FieldValues } from 'react-hook-form';
import { BlockNote, type BlockNoteContentApi } from '~/modules/common/blocknote/blocknote-editor';
import type { CommonBlockNoteProps } from '~/modules/common/blocknote/types';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';

export type BlockNoteContentFormFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  /** `media.upload` turns uploads on. */
  baseBlockNoteProps: Omit<CommonBlockNoteProps, 'defaultValue'>;
  autoFocus?: boolean;
  containerClassName?: string;
  /** The editor's handle, for a form's own "Add files" control (`addFiles`). */
  contentApiRef?: RefObject<BlockNoteContentApi | null>;
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
  contentApiRef,
  baseBlockNoteProps,
}: BlockNoteContentFormFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange, value } }) => (
        <FormItem name={name} disabled={disabled} className={containerClassName}>
          {label && (
            <FormLabel required={required} onClick={focusEditor}>
              {label}
            </FormLabel>
          )}
          <BlockNote
            commitOnEveryChange
            autoFocus={autoFocus}
            editable={!disabled}
            defaultValue={value}
            updateData={onChange}
            ariaLabel={label}
            contentApiRef={contentApiRef}
            {...baseBlockNoteProps}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
