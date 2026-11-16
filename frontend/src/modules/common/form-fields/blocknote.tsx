import type { MouseEvent, RefObject } from 'react';
import { type FieldValues, get } from 'react-hook-form';
import { BlockNote, type BlockNoteContentApi } from '~/modules/common/blocknote/blocknote-editor';
import { blocknoteHasContent } from '~/modules/common/blocknote/helpers/blocknote-has-content';
import type { CommonBlockNoteProps } from '~/modules/common/blocknote/types';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { cn } from '~/utils/cn';

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
      render={({ field: { onChange, value }, fieldState: { invalid }, formState: { defaultValues } }) => {
        // An emptied document gives back the field's blank default and reads clean. A default with content empties to ''.
        const blank = get(defaultValues, name);
        const emptyValue = typeof blank === 'string' && blocknoteHasContent(blank) ? '' : blank;

        return (
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
              updateData={(strBlocks) => onChange(blocknoteHasContent(strBlocks) ? strBlocks : emptyValue)}
              ariaLabel={label}
              contentApiRef={contentApiRef}
              {...baseBlockNoteProps}
              // The input frame, ringed while focus is inside; a form sets the side-menu gutter with `--bn-field-inset`
              className={cn(
                'bn-field focus-within-effect border-input bg-background rounded-md border text-sm',
                invalid && 'border-destructive',
                baseBlockNoteProps.className,
              )}
            />
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
