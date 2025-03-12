import type { LucideProps } from 'lucide-react';
import type React from 'react';
import useMounted from '~/hooks/use-mounted';
import { cn } from '~/utils/cn';

interface Props {
  title: string;
  Icon?: React.ElementType<LucideProps>;
  text?: string | React.ReactNode;
  className?: string;
  textClassName?: string;
}

const ContentPlaceholder = ({ title, Icon, text, textClassName = '', className = '' }: Props) => {
  const { hasStarted } = useMounted();

  return (
    <div
      data-started={hasStarted}
      className={cn(
        'flex flex-col items-center w-full text-center p-8 h-full justify-center relative',
        'duration-150 transition-all data-[started=false]:opacity-0',
        className,
      )}
    >
      {Icon && <Icon strokeWidth={0.7} size={80} className="opacity-50" />}
      <p className="mt-4 text-sm opacity-60">{title}</p>
      {text && <div className={cn('mt-12 text-sm font-medium', textClassName)}>{text}</div>}
    </div>
  );
};

export default ContentPlaceholder;
