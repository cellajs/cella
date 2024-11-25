'use client';

import * as React from 'react';

import { useAutoResize } from '~/hooks/use-auto-resize';
import { cn } from '~/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, autoResize = false, ...props }, ref) => {
  const { areaRef } = useAutoResize(ref, autoResize);

  return (
    <textarea
      className={cn(
        'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring  focus-visible:ring-ring max-sm:focus-visible:ring-transparent max-sm:focus-visible:ring-offset-0 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
        autoResize && 'overflow-hidden resize-none',
      )}
      ref={areaRef}
      {...props}
    />
  );
});

Textarea.displayName = 'Textarea';

export { Textarea };
