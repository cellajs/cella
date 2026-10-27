/**
 * The layer of the sheet `element` sits in, or null outside a sheet. Sheets sit above the page's floating layers (spotlight
 * dim, selection bar, a confirmation docked in the bar's place), so sheet content renders those into this element.
 */
export const sheetLayerOf = (element: Element | null | undefined) => element?.closest<HTMLElement>('[data-sheet-layer]') ?? null;
