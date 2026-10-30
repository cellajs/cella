import type { ReactNode } from 'react';
import { cn } from '~/utils/cn';

interface AsideAnchorProps {
  id: string;
  className?: string;
  children?: ReactNode;
}

export function AsideAnchor({ id, className, children }: AsideAnchorProps) {
  return (
    <div id={`spy-${id}-anchor-wrap`} className={cn('last:mb-12 md:last:mb-[70vh]', className)}>
      <div id={`spy-${id}`} className="absolute -mt-16 h-16 w-[.05rem]" />
      {children}
    </div>
  );
}
