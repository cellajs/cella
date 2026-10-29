import type { ComponentProps } from 'react';
import { cn } from '~/utils/cn';

/** A form's submit button and its way out, side by side at every width; on a phone the submit button fills the row. */
export function FormActions({ className, ...props }: ComponentProps<'div'>) {
  return <div data-form-actions className={cn('flex flex-wrap gap-2 max-sm:*:first:flex-1', className)} {...props} />;
}
