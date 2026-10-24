import { createContext, type ReactNode, useContext } from 'react';
import { backIfCurrent, type InternalDropdown, removeIfCurrent } from '~/modules/common/dropdowner/use-dropdowner';
import { OverlayCloseContext } from '~/modules/common/overlay-close';

/** Where dropdowner content renders: a desktop menu or panel popup, or the mobile drawer. */
export type DropdownerSurface = 'menu' | 'panel' | 'drawer';

const DropdownerSurfaceContext = createContext<DropdownerSurface | null>(null);

/** The dropdowner surface this content renders on; null outside the dropdowner. */
export const useDropdownerSurface = () => useContext(DropdownerSurfaceContext);

interface DropdownerContentProps {
  dropdown: InternalDropdown;
  surface: DropdownerSurface;
  children: ReactNode;
}

/** Tells dropdowner content where it renders and how to close or step back out of it. */
export function DropdownerContent({ dropdown, surface, children }: DropdownerContentProps) {
  const overlay = { close: () => removeIfCurrent(dropdown.key), back: () => backIfCurrent(dropdown.key) };

  return (
    <DropdownerSurfaceContext.Provider value={surface}>
      <OverlayCloseContext.Provider value={overlay}>{children}</OverlayCloseContext.Provider>
    </DropdownerSurfaceContext.Provider>
  );
}
