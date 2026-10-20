/**
 * Tracks whether the latest input was touch or pen, so auto-focus can leave text fields alone after it: focusing one
 * there opens the on-screen keyboard. It follows each gesture, so an iPad with a trackpad and a touchscreen laptop
 * each get the behavior of the input in hand.
 */

let touch: boolean | null = null;

/** Whether the latest input was touch or pen; before any input, whether the primary pointer is coarse. */
export const isTouchInteraction = () => touch ?? window.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Starts tracking; call once at boot, before the first input. */
export const initInputModality = () => {
  const options = { capture: true, passive: true };
  window.addEventListener(
    'pointerdown',
    (event) => {
      touch = event.pointerType === 'touch' || event.pointerType === 'pen';
    },
    options,
  );
  window.addEventListener(
    'keydown',
    () => {
      touch = false;
    },
    options,
  );
};
