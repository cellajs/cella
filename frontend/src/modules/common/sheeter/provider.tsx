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

  // Get sheets from store
  const sheets = useSheeter((state) => state.sheets);

  if (!sheets.length) return null;

  return (
    <>
      {sheets.map((sheet) => {
        const SheetComponent = isMobile ? MobileSheet : DesktopSheet;
        return <SheetComponent key={sheet.id} sheet={sheet} />;
      })}
    </>
  );
};
