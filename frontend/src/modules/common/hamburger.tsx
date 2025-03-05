import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

interface HamburgerButtonProps {
  isOpen: boolean;
  toggle: (isOpen: boolean) => void;
  className?: string;
}
const HamburgerLine = ({
  className,
  lineColor,
}: {
  className: string;
  lineColor: string;
}) => <div className={cn('ease my-[.19rem] h-0.5 w-6 rounded-full transition duration-300', className)} style={{ backgroundColor: lineColor }} />;

const HamburgerButton = ({ isOpen, toggle, className }: HamburgerButtonProps) => {
  const mode = useUIStore((state) => state.mode);
  const lineColor = mode === 'dark' ? 'white' : 'black';

  const topLineClass = isOpen ? 'rotate-45 translate-y-2' : '';
  const middleLineClass = isOpen ? 'opacity-0' : 'opacity-100';
  const bottomLineClass = isOpen ? '-rotate-45 -translate-y-2' : '';

  return (
    <button
      className={cn('group flex h-10 w-10 flex-col items-center hover:opacity-50 justify-center', className)}
      type="button"
      onClick={() => toggle(!isOpen)}
      aria-expanded={isOpen}
      aria-label="toggle menu"
    >
      <HamburgerLine className={topLineClass} lineColor={lineColor} />
      <HamburgerLine className={middleLineClass} lineColor={lineColor} />
      <HamburgerLine className={bottomLineClass} lineColor={lineColor} />
    </button>
  );
};

export default HamburgerButton;
