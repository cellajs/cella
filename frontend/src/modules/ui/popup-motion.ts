import { tw } from '~/utils/tw';

/**
 * Enter and exit of a popup Base UI positions (popover, menu, tooltip, select, combobox, preview card): a fade with a
 * slight scale from its anchor and an 8px slide from the side it opens on. A transition: a close during the enter
 * reverses from where the popup is, and under reduced motion the fade alone remains.
 */
export const popupMotionClass = tw(
  'origin-(--transform-origin) transition-[opacity,translate,scale] duration-150 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:[--popup-shift:0_-0.5rem] data-[side=inline-end]:[--popup-shift:-0.5rem_0] data-[side=inline-start]:[--popup-shift:0.5rem_0] data-[side=left]:[--popup-shift:0.5rem_0] data-[side=right]:[--popup-shift:-0.5rem_0] data-[side=top]:[--popup-shift:0_0.5rem] motion-safe:data-ending-style:[translate:var(--popup-shift)] motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:[translate:var(--popup-shift)] motion-safe:data-starting-style:scale-95',
);
