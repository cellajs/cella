/** Last focused button, for focus restoration. Set by overlay stores (sheeter, dialoger) before blurring it. */
export const fallbackContentRef: { current: HTMLButtonElement | HTMLAnchorElement | null } = {
  current: null,
};
