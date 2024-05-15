import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type React from 'react';
import { cn } from '~/lib/utils';

interface DropIndicatorProps {
  edge: Edge;
  className?: string;
}

export const DropIndicator: React.FC<DropIndicatorProps> = ({ edge, className = '' }) => {
  console.log(edge)
  return (
    <div
      className={cn('absolute w-full bg-primary rounded-sm', ['top', 'bottom'].includes(edge) ? 'left-0 w-full h-1' : 'top-0 h-full w-1', `${edge}-0`, className)}
    />
  );
};
