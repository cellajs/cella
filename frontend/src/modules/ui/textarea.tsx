import * as React from 'react';
import { useAutoResize } from '~/hooks/use-auto-resize';
import { cn } from '~/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
}

function Textarea({ className, autoResize = false, ...props }: React.ComponentProps<'textarea'> & { autoResize?: boolean }) {
  const { areaRef } = useAutoResize(autoResize);

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
        autoResize && 'overflow-hidden resize-none',
      )}
      ref={areaRef}
      {...props}
    />
  );
}

export { Textarea };
