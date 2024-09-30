import { cn } from '~/utils/utils';

interface AsideAnchorProps {
  className?: string;
  id: string;
  children?: React.ReactNode;
}

export const AsideAnchor = ({ id, className, children }: AsideAnchorProps) => {
  return (
    // aside-anchor class is used to correct the offset of the anchor
    <div id={id} className={cn('', className)}>
      <div id={`${id}-anchor`} className="absolute w-[.07rem] -mt-20 h-20 sm:-mt-16 sm:h-16" />
      {children}
    </div>
  );
};
