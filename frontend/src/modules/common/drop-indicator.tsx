import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type React from 'react';
import { cn } from '~/utils/cn';

interface Props {
  edge: Edge;
  className?: string;
  gap: number;
}

/**
 * A visual indicator for drop targets during drag-and-drop operations, positioned based on the closest edge and with a customizable gap.
 */
export const DropIndicator = ({ edge, className = '', gap = 0 }: Props) => {
  const dropIndicatorEdgeStyles = {
    top: {
      top: `${-gap / 2}rem`,
    },
    bottom: {
      bottom: `${-gap / 2}rem`,
    },
    left: {
      left: `${-gap / 2}rem`,
    },
    right: {
      right: `${-gap / 2}rem`,
    },
  };

  return (
    <div
      style={{ ...dropIndicatorEdgeStyles[edge], '--gap': gap } as React.CSSProperties & { '--gap': number }}
      className={cn(
        'absolute w-full bg-primary rounded-sm z-100',
        ['top', 'bottom'].includes(edge) ? 'left-0 w-full h-1' : 'top-0 h-full w-1',
        `${edge}-0`,
        className,
      )}
    />
  );
};
