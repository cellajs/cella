import { OTPField } from '@base-ui/react/otp-field';
import { MinusIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '~/utils/cn';

/** One-time code field on Base UI's OTPField: one input per slot, Field-aware, `autoComplete="one-time-code"` by default. */
export function InputOTP({ className, ...props }: OTPField.Root.Props) {
  return <OTPField.Root data-slot="input-otp" className={cn('flex items-center gap-2 data-disabled:opacity-50', className)} {...props} />;
}

export function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="input-otp-group" className={cn('flex items-center', className)} {...props} />;
}

export function InputOTPSlot({ className, ...props }: OTPField.Input.Props) {
  return (
    <OTPField.Input
      data-slot="input-otp-slot"
      className={cn(
        'relative size-9 border-input border-y border-r bg-background text-center text-sm shadow-xs outline-hidden transition-all first:rounded-l-md first:border-l last:rounded-r-md focus:z-10 focus:border-ring focus:ring-2 focus:ring-ring disabled:cursor-not-allowed data-invalid:border-destructive data-invalid:focus:ring-destructive/20 dark:data-invalid:focus:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export function InputOTPSeparator({ ...props }: React.ComponentProps<'div'>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: required for layout
    <div data-slot="input-otp-separator" role="separator" {...props}>
      <MinusIcon className="size-6" />
    </div>
  );
}
