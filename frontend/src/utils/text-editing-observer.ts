const isTextEditor = (element: Element | null) => {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  return element.isContentEditable;
};

/**
 * Sets a `text-editing` class on <body> while a touch device has a textarea or contenteditable focused, which unpins sticky
 * and fixed UI: a keyboard only shrinks the visual viewport, so panning brings UI pinned to the layout viewport over the text.
 * It follows focus, not the keyboard: Android's back gesture closes the keyboard while the editor keeps focus.
 */
export const initTextEditingObserver = () => {
  let rafId = 0;

  const update = () => {
    rafId = 0;
    const touchDevice = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    document.body.classList.toggle('text-editing', touchDevice && isTextEditor(document.activeElement));
  };

  document.addEventListener('focusin', update);
  // On focusout the next element has no focus yet: measured a frame later, moving between fields never flips the class
  document.addEventListener('focusout', () => {
    if (!rafId) rafId = requestAnimationFrame(update);
  });
  update();
};
