/**
 * Stores a reference to the last focused button for focus restoration.
 */
export const fallbackContentRef = {
  current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null,
};
