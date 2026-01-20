import type { Ref } from 'react';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

interface HamburgerButtonProps {
  isOpen: boolean;
  toggle: () => void;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}
const HamburgerLine = ({ className, lineColor }: { className: string; lineColor: string }) => (
  <div
    className={cn('ease my-[.13rem] h-[.1rem] w-5.5 rounded-full transition duration-300', className)}
    style={{ backgroundColor: lineColor }}
  />
);

const HamburgerButton = ({ isOpen, toggle, className, ref }: HamburgerButtonProps) => {
  const mode = useUIStore((state) => state.mode);
  const lineColor = mode === 'dark' ? 'white' : 'black';

  return (
    <Button
      ref={ref}
      size="lg"
      variant="ghost"
      className={cn(
        'group flex h-10 w-10 flex-col items-center justify-center data-[open=true]:pointer-events-none',
        className,
      )}
      type="button"
      onClick={() => toggle()}
      aria-expanded={isOpen}
      aria-label="toggle menu"
      data-open={isOpen}
    >
      <HamburgerLine
        className="group-data-[open=true]:rotate-45 group-data-[open=true]:translate-y-1.5"
        lineColor={lineColor}
      />
      <HamburgerLine className="opacity-100 group-data-[open=true]:opacity-0" lineColor={lineColor} />
      <HamburgerLine
        className="group-data-[open=true]:-rotate-45 group-data-[open=true]:-translate-y-1.5"
        lineColor={lineColor}
      />
    </Button>
  );
};

export default HamburgerButton;
