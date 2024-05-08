import type { LucideProps } from 'lucide-react';
import type React from 'react';
import { cn } from '~/lib/utils';

interface Props {
  title: string;
  Icon?: React.ElementType<LucideProps>;
  text?: string | React.ReactNode;
  className?: string;
}

const ContentPlaceholder = ({ title, Icon, text, className = '' }: Props) => {
  return (
    <div className={cn('flex flex-col items-center w-full p-8 h-full justify-center', className)}>
      {Icon && <Icon strokeWidth={0.7} size={80} className="opacity-50" />}
      <p className="mt-6 text-sm">{title}</p>
      {text && <p className="mt-6 text-sm font-medium">{text}</p>}
    </div>
  );
};

export default ContentPlaceholder;
