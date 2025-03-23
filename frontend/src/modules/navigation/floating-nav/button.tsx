import type { LucideProps } from 'lucide-react';
import type React from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface Props {
  id: string;
  Icon: React.ElementType<LucideProps>;
  onClick: () => void;
  className?: string;
  direction?: 'left' | 'right';
}

const FloatingNavButton = ({ id, Icon, onClick, className, direction = 'right' }: Props) => {
  return (
    <Button
      id={id}
      size="icon"
      data-direction={direction}
      variant="secondary"
      onClick={onClick}
      className={cn(
        `fixed z-105 w-12 h-12 flex items-center shadow-lg hover:bg-secondary justify-center rounded-full bottom-3 
        data-[direction=left]:left-3 data-[direction=right]:right-3`,
        className,
      )}
      aria-label="Navigate"
    >
      <Icon size={24} strokeWidth={1.5} />
    </Button>
  );
};

export default FloatingNavButton;
