import { cn } from '~/utils/cn';

export const Kbd = ({ className = '', value = '' }) => {
  return (
    <span className={cn('max-xs:hidden border rounded-sm flex items-center justify-center size-[1.13rem] text-xs opacity-50y', className)}>
      <kbd>{value}</kbd>
    </span>
  );
};
