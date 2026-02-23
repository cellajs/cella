/**
 * Stores a reference to the last focused button for focus restoration.
 * Updated by overlay stores (sheeter, dialoger) before blurring the active element.
 */
export const fallbackContentRef: { current: HTMLButtonElement | HTMLAnchorElement | null } = {
  current: null,
};
