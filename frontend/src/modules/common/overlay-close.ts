import { createContext, useContext } from 'react';

export interface OverlayClose {
  /** Closes the dropdown or dialog the content renders in. */
  close: () => void;
  /** Returns to what the overlay showed before this content (a menu before its confirmation), or closes when nothing came before. */
  back: () => void;
}

export const OverlayCloseContext = createContext<OverlayClose | null>(null);

/** How content closes the dropdown or dialog it renders in; null outside one. */
export const useOverlayClose = () => useContext(OverlayCloseContext);
