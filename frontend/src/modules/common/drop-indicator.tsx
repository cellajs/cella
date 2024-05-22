import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type React from 'react';
import { cn } from '~/lib/utils';

interface DropIndicatorProps {
  edge: Edge;
  className?: string;
  gap?: string;
}

const dropIndicatorEdgeStyles = {
  top: (gap: string) => ({
    top: `calc(-1 * (${gap} / 2 + 4px / 2))`,
  }),
  bottom: (gap: string) => ({
    bottom: `calc(-1 * (${gap} / 2 + 4px / 2))`,
  }),
  left: () => {},
  right: () => {},
};

export const DropIndicator: React.FC<DropIndicatorProps> = ({ edge, className = '', gap = '0px' }) => {
  return (
    <div
      style={{ ...dropIndicatorEdgeStyles[edge](gap), '--gap': gap } as unknown as React.CSSProperties}
      className={cn(
        'absolute w-full bg-primary rounded-sm',
        ['top', 'bottom'].includes(edge) ? 'left-0 w-full h-1' : 'top-0 h-full w-1',
        `${edge}-0`,
        className,
      )}
    />
  );
};
