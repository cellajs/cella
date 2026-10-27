import type * as React from 'react';
import { useAutoResize } from '~/hooks/use-auto-resize';
import { inputClass } from '~/modules/ui/input';
import { cn } from '~/utils/cn';

export interface TextareaProps extends React.ComponentProps<'textarea'> {
  autoResize?: boolean;
}

export function Textarea({ className, autoResize = false, ref, ...props }: TextareaProps) {
  const { areaRef } = useAutoResize(autoResize);

  // A caller's ref (e.g. react-hook-form's) and the auto-resize ref both need the node.
  const setRefs = (node: HTMLTextAreaElement | null) => {
    areaRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <textarea
      data-slot="textarea"
      className={cn(inputClass, 'field-sizing-content flex min-h-16', autoResize && 'resize-none overflow-hidden', className)}
      ref={setRefs}
      {...props}
    />
  );
}
