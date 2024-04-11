import { cn } from '~/lib/utils';

interface AsideAnchorProps {
  className?: string;
  id: string;
  children?: React.ReactNode;
}

export const AsideAnchor = ({ id, className, children }: AsideAnchorProps) => {
  return (
    // aside-anchor class is used to correct the offset of the anchor
    <div id={id} className={cn('-mt-20 pt-20 md:-mt-16 md:pt-16', className)}>
      {children}
    </div>
  );
};
