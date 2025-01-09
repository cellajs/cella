// Check if focused element is interactive
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
