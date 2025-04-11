import type { LucideProps } from 'lucide-react';
import type React from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface Props {
  id: string;
  icon: React.ElementType<LucideProps>;
  onClick: () => void;
  className?: string;
  direction?: 'left' | 'right';
}

const FloatingNavButton = ({ id, icon: Icon, onClick, className, direction = 'right' }: Props) => {
  return (
    <Button
      id={id}
      size="icon"
      data-direction={direction}
      variant="secondary"
      onClick={onClick}
      className={cn(
        `fixed z-105 w-14 h-14 flex items-center shadow-lg hover:bg-secondary justify-center rounded-full bottom-4 
        transition-all duration-300 ease-in-out transform opacity-100 active:scale-95
        data-[direction=left]:left-4 data-[direction=right]:right-4`,
        className,
      )}
      aria-label="Navigate"
    >
      <Icon size={24} strokeWidth={1.5} />
    </Button>
  );
};

export default FloatingNavButton;
