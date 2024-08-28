import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types';
import type React from 'react';
import { cn } from '~/lib/utils';

interface DropIndicatorProps {
  edge: Edge;
  className?: string;
  gap: number;
}

export const DropIndicator: React.FC<DropIndicatorProps> = ({ edge, className = '', gap = 0 }) => {
  const dropIndicatorEdgeStyles = {
    top: {
      top: `${-gap / 2}rem`,
    },
    bottom: {
      bottom: `${-gap / 2}rem`,
    },
    left: () => {},
    right: () => {},
  };

  return (
    <div
      style={{ ...dropIndicatorEdgeStyles[edge], '--gap': gap } as unknown as React.CSSProperties}
      className={cn(
        'absolute w-full bg-primary rounded-sm z-100',
        ['top', 'bottom'].includes(edge) ? 'left-0 w-full h-1' : 'top-0 h-full w-1',
        `${edge}-0`,
        className,
      )}
    />
  );
};
