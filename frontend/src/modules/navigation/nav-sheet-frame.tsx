import type { ReactNode, Ref } from 'react';
import { FocusBridge, FocusTarget } from '~/modules/navigation/focus-bridge';
import { MenuSheetPanels } from '~/modules/navigation/menu-sheet/sheet-panel';
import { cn } from '~/utils/cn';

interface NavSheetFrameProps {
  children: ReactNode;
  /** Sticky bottom panels (preferences etc.); without them the bridges take `mt-auto` to stay at the bottom. */
  panels?: boolean;
  ref?: Ref<HTMLDivElement>;
  className?: string;
}

/** Shell of every nav sheet: card column, the sheet focus target first, optional panels, and the bottom focus bridges. */
export function NavSheetFrame({ children, panels = false, ref, className }: NavSheetFrameProps) {
  return (
    <div ref={ref} className={cn('group/menu flex min-h-dvh w-full flex-col bg-card', className)}>
      <FocusTarget target="sheet" />
      {children}
      {panels && (
        <>
          <span className="mt-10" />
          <MenuSheetPanels />
        </>
      )}
      <div className={cn('flex flex-col focus-within:p-3', !panels && 'mt-auto')}>
        <FocusBridge direction="to-content" className="focus:relative" />
        <FocusBridge direction="to-sidebar" className="focus:relative" />
      </div>
    </div>
  );
}
