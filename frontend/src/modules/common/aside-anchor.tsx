import { cn } from '~/utils/cn';

interface AsideAnchorProps {
  id: string;
  className?: string;
  children?: React.ReactNode;
  extraOffset?: boolean;
}

export const AsideAnchor = ({ id, className, children, extraOffset }: AsideAnchorProps) => {
  return (
    <div id={`${id}-anchor-wrap`} className={cn('last:mb-12 md:last:mb-[70vh]', className)}>
      <div id={id} className={cn('absolute w-[.07rem]', extraOffset ? '-mt-16 h-16' : '-mt-8 h-8')} />
      {children}
    </div>
  );
};
