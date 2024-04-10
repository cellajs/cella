import { cn } from '~/lib/utils';

interface AsideAnchorProps {
  className?: string;
  id: string;
  children?: React.ReactNode;
}

export const AsideAnchor = ({ id, className, children }: AsideAnchorProps) => {
  return (
    // aside-anchor class is used to correct the offset of the anchor
    <div id={id} className={cn('first:-mt-20 first:pt-20 md:first:-mt-10 md:first:pt-10', className)}>
      {children}
    </div>
  );
};
