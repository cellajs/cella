import type { LucideProps } from 'lucide-react';
import type React from 'react';
import { cn } from '~/utils/utils';

interface Props {
  title: string;
  Icon?: React.ElementType<LucideProps>;
  text?: string | React.ReactNode;
  className?: string;
}

const ContentPlaceholder = ({ title, Icon, text, className = '' }: Props) => {
  return (
    <div className={cn('flex flex-col items-center w-full text-center p-8 h-full justify-center relative', className)}>
      {Icon && <Icon strokeWidth={0.7} size={80} className="opacity-50" />}
      <p className="mt-4 text-sm opacity-60">{title}</p>
      {text && <div className="mt-12 text-sm font-medium">{text}</div>}
    </div>
  );
};

export default ContentPlaceholder;
