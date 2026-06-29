import { cn } from '~/utils/cn';

interface AsideAnchorProps {
  id: string;
  className?: string;
  children?: React.ReactNode;
  extraOffset?: boolean;
}

/**
 * Create an anchor point for in-page navigation with an offset element.
 * @param id - The unique identifier for the anchor.
 * @param className - Optional additional class names for styling.
 * @param children - Optional child elements to render within the anchor wrapper.
 * @param extraOffset - Optional boolean to add extra offset for the anchor position.
 */
export const AsideAnchor = ({ id, className, children, extraOffset }: AsideAnchorProps) => {
  return (
    <div id={`spy-${id}-anchor-wrap`} className={cn('last:mb-12 md:last:mb-[70vh]', className)}>
      {/* Offset element for anchor positioning */}
      <div id={`spy-${id}`} className={cn('absolute w-[.05rem]', extraOffset ? '-mt-16 h-16' : '-mt-8 h-8')} />
      {/* Actual content */}
      {children}
    </div>
  );
};
