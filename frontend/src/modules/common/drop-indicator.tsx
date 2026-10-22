import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { cn } from '~/utils/cn';

interface DropIndicatorProps {
  edge: Edge;
  className?: string;
  gap?: number;
}

export function DropIndicator({ edge, className = '', gap = 0 }: DropIndicatorProps) {
  return (
    <div
      style={{ [edge]: `${-gap / 2}rem` }}
      className={cn('absolute z-100 rounded-sm bg-primary', ['top', 'bottom'].includes(edge) ? 'left-0 h-1 w-full' : 'top-0 h-full w-1', className)}
    />
  );
}
