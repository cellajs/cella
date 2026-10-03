/**
 * True while a tooltip or hover card is showing. Its Escape closes that popup and stops there, so the sheet or dialog
 * around it stays open and focus does not move (WCAG 1.4.13).
 */
export const isHoverContentOpen = () => !!document.querySelector('[data-slot="tooltip-content"], [data-slot="hover-card-content"]');
