import { cn } from '~/utils/cn';

const methodColors: Record<string, string> = {
  get: 'text-blue-700 dark:text-blue-400',
  post: 'text-emerald-700 dark:text-emerald-400',
  put: 'text-orange-700 dark:text-orange-300',
  delete: 'text-red-700 dark:text-red-400',
  patch: 'text-purple-700 dark:text-purple-400',
};

const sizes = { sm: 'text-xs', md: 'text-md' };

interface MethodLabelProps {
  /** Lowercase; CSS uppercases it. */
  method: string;
  size?: keyof typeof sizes;
}

export function MethodLabel({ method, size = 'sm' }: MethodLabelProps) {
  return (
    <span className={cn('shrink-0 font-mono font-medium uppercase', methodColors[method] ?? 'text-muted-foreground', sizes[size])}>{method}</span>
  );
}
