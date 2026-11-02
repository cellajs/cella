const flightTiming = { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'both' } as const;

const translateBetween = (from: DOMRect, to: DOMRect) => `translate(${from.left - to.left}px, ${from.top - to.top}px)`;

const asFlight = (animations: Animation[]) => ({
  finished: Promise.all(animations.map(({ finished }) => finished)),
  cancel: () => {
    for (const animation of animations) animation.cancel();
  },
});

/** Moves a phone's search dialog between its full screen and the field it opens from: `normal` opens, `reverse` closes. */
export function flySearchDialog(popup: HTMLElement, field: HTMLElement, direction: 'normal' | 'reverse') {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return asFlight([]);

  const timing = { ...flightTiming, direction };
  const popupBox = popup.getBoundingClientRect();
  const fieldBox = field.getBoundingClientRect();

  // The sheet clips down to the field and its parts travel there, so taking the dialog away after a close changes nothing on screen
  const fieldClip = `inset(${fieldBox.top - popupBox.top}px ${popupBox.right - fieldBox.right}px ${popupBox.bottom - fieldBox.bottom}px ${fieldBox.left - popupBox.left}px)`;
  const animations = [popup.animate({ clipPath: [fieldClip, 'inset(0px 0px 0px 0px)'] }, timing)];

  const bar = popup.querySelector('[data-slot="search-dialog-bar"]');
  const barIcon = bar?.querySelector('svg');
  const fieldIcon = field.querySelector('svg');
  if (bar && barIcon && fieldIcon) {
    animations.push(
      bar.animate({ transform: [translateBetween(fieldIcon.getBoundingClientRect(), barIcon.getBoundingClientRect()), 'none'] }, timing),
    );
  }

  for (const chip of popup.querySelectorAll<HTMLElement>('[data-search-chip]')) {
    const place = field.querySelector(`[data-search-chip="${CSS.escape(chip.dataset.searchChip ?? '')}"]`);
    // A chip the field has no room for has no place to travel to
    const isInField = !!place && getComputedStyle(place).visibility === 'visible';
    animations.push(
      isInField
        ? chip.animate({ transform: [translateBetween(place.getBoundingClientRect(), chip.getBoundingClientRect()), 'none'] }, timing)
        : chip.animate({ opacity: [0, 1] }, timing),
    );
  }

  for (const element of popup.querySelectorAll('[data-flight-fade]')) animations.push(element.animate({ opacity: [0, 1] }, timing));

  return asFlight(animations);
}
