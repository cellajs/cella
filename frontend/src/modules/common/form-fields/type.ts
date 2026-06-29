import type { Control, FieldValues, Path } from 'react-hook-form';

/**
 * Shared base props for form field components integrated with react-hook-form.
 */
export type BaseFormFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  disabled?: boolean;
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
