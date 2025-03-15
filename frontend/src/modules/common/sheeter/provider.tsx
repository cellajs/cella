import { useEffect, useRef } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { MobileSheet } from '~/modules/common/sheeter/drawer';
import { DesktopSheet } from '~/modules/common/sheeter/sheet';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';

/**
 * Sheeter provider to render drawers on mobile and sheets on other screens.
 * State is managed by the useSheeter zustand store hook.
 */
export const Sheeter = () => {
  const isMobile = useBreakpoints('max', 'sm');
  const prevFocusedElement = useRef<HTMLElement | null>(null);

  const sheets = useSheeter((state) => state.sheets);
  const removeSheet = useSheeter((state) => state.remove);

  useEffect(() => {
    // Keep track of the previously focused element before a sheet opens
    prevFocusedElement.current = (document.activeElement || document.body) as HTMLElement;

    return () => {
      if (prevFocusedElement.current) {
        setTimeout(() => prevFocusedElement.current?.focus(), 1);
      }
    };
  }, [sheets.length]); // Run when sheets change

  if (!sheets.length) return null;

  return (
    <>
      {sheets.map((sheet) => {
        const SheetComponent = isMobile ? MobileSheet : DesktopSheet;
        return <SheetComponent key={sheet.id} sheet={sheet} removeSheet={() => removeSheet(sheet.id)} />;
      })}
    </>
  );
};
