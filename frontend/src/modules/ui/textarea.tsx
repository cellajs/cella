import type * as React from 'react';
import { useAutoResize } from '~/hooks/use-auto-resize';
import { cn } from '~/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
}

export function Textarea({
  className,
  autoResize = false,
  ...props
}: React.ComponentProps<'textarea'> & { autoResize?: boolean }) {
  const { areaRef } = useAutoResize(autoResize);

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className,
        autoResize && 'resize-none overflow-hidden',
      )}
      ref={areaRef}
      {...props}
    />
  );
}
