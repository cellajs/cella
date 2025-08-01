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
        'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-effect disabled:cursor-not-allowed disabled:opacity-50',
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
