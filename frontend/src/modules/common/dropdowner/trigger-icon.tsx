import type { IconComponent } from '~/modules/common/icons/types';
import { cn } from '~/utils/cn';

interface DropdownerTriggerIconProps {
  icon: IconComponent;
  className?: string;
}

/** A dropdown trigger's icon, drawn over by a check while the dropdowner marks the trigger done (`complete`). */
export function DropdownerTriggerIcon({ icon: Icon, className }: DropdownerTriggerIconProps) {
  return (
    <span className="inline-grid place-items-center">
      <Icon
        className={cn(
          'col-start-1 row-start-1 in-data-dropdowner-done:scale-50 in-data-dropdowner-done:opacity-0 transition-[opacity,scale] duration-200 motion-reduce:transition-none',
          className,
        )}
      />
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          'col-start-1 row-start-1 text-success in-data-dropdowner-done:opacity-100 opacity-0 transition-opacity motion-reduce:transition-none',
          className,
        )}
      >
        <path
          pathLength={1}
          d="M20 6 9 17l-5-5"
          className="transition-[stroke-dashoffset] delay-75 duration-300 ease-out [stroke-dasharray:1] [stroke-dashoffset:1] in-data-dropdowner-done:[stroke-dashoffset:0] motion-reduce:transition-none"
        />
      </svg>
    </span>
  );
}
