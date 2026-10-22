import type { MouseEvent } from 'react';

/** A click with a modifier key, which the browser turns into a new tab, a new window or a download: link handlers leave it alone. */
export const isModifiedClick = (event: MouseEvent) => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
