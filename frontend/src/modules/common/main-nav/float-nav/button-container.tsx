import type { LucideProps } from 'lucide-react';
import type React from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface MobileNavButtonProps {
  id: string;
  Icon: React.ElementType<LucideProps>;
  onClick: () => void;
  className?: string;
  direction?: 'left' | 'right';
}

const MobileNavButton: React.FC<MobileNavButtonProps> = ({ id, Icon, onClick, className, direction = 'right' }) => {
  return (
    <Button
      id={id}
      size="icon"
      data-direction={direction}
      variant="secondary"
      onClick={onClick}
      className={cn(
        `fixed z-[100] w-14 h-14 flex items-center shadow-lg hover:bg-secondary justify-center rounded-full bottom-3 
        data-[direction=left]:left-3 data-[direction=right]:right-3`,
        className,
      )}
      aria-label="Nav Button"
    >
      <Icon size={24} strokeWidth={1.5} />
    </Button>
  );
};

export default MobileNavButton;
