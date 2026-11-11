/** Moves focus when an element mounts: what held focus is gone. A stable reference, so a rerender moves nothing. */
export const focusOnMount = (node: HTMLElement | null) => node?.focus();
