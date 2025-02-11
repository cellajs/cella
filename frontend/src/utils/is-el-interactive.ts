/**
 * Checks if the given element is interactive (input, textarea, select, button, or contenteditable).
 *
 * @param element - Element to check.
 * @returns Boolean(if element is interactive).
 */
export function isElementInteractive(element: Element | null) {
  if (!element) return false;
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLButtonElement ||
    element?.getAttribute('contenteditable') === 'true'
  );
}
