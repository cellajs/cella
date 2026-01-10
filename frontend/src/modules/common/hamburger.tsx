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

  const topLineClass = isOpen ? 'rotate-45 translate-y-1.5' : '';
  const middleLineClass = isOpen ? 'opacity-0' : 'opacity-100';
  const bottomLineClass = isOpen ? '-rotate-45 -translate-y-1.5' : '';

  return (
    <Button
      ref={ref}
      size="lg"
      variant="ghost"
      className={cn(
        'group flex h-10 w-10 flex-col items-center justify-center',
        className,
        isOpen && 'pointer-events-none',
      )}
      type="button"
      onClick={() => toggle()}
      aria-expanded={isOpen}
      aria-label="toggle menu"
    >
      <HamburgerLine className={topLineClass} lineColor={lineColor} />
      <HamburgerLine className={middleLineClass} lineColor={lineColor} />
      <HamburgerLine className={bottomLineClass} lineColor={lineColor} />
    </Button>
  );
};

export default HamburgerButton;
