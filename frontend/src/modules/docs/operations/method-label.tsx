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
  /** HTTP method in lowercase, as the docs JSON holds it; CSS uppercases it. */
  method: string;
  size?: keyof typeof sizes;
}

export function MethodLabel({ method, size = 'sm' }: MethodLabelProps) {
  return (
    <span className={cn('shrink-0 font-medium font-mono uppercase', methodColors[method] ?? 'text-gray-600 dark:text-gray-400', sizes[size])}>
      {method}
    </span>
  );
}
