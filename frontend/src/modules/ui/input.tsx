import * as React from 'react';

import { cn } from '~/utils/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const inputClass =
  'border-input bg-background ring-offset-background placeholder:text-muted-foreground  focus-visible:ring-ring max-sm:focus-visible:ring-transparent max-sm:focus:ring-offset-0 flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return <input type={type} className={cn(inputClass, className)} ref={ref} {...props} />;
});
Input.displayName = 'Input';

export { Input };
