import type { LucideProps } from 'lucide-react';
import type React from 'react';
import { Button } from '~/modules/ui/button';

interface MobileNavButtonProps {
  Icon: React.ElementType<LucideProps>;
  onClick: () => void;
  className?: string;
  direction?: 'left' | 'right';
}

const MobileNavButton: React.FC<MobileNavButtonProps> = ({ Icon, onClick, className, direction = 'right' }) => {
  const positionClasses = `${direction}-3`;

  return (
    <Button
      size="icon"
      variant="default"
      onClick={onClick}
      className={`fixed z-[100] flex items-center justify-center rounded-full bottom-3 ${positionClasses} ${className}`}
      aria-label="Nav Button"
    >
      <Icon size={18} />
    </Button>
  );
};

export default MobileNavButton;
