import { tw } from '~/utils/tw';

/** Puts a `size-8` icon and the text after it on the columns of a `MenuSheetItem`, in a row at the menu's own inset. */
export const menuColumnsClass = tw('gap-4 px-3');

/** The line that sets a menu sheet's organization apart from what follows, as strong as the lines that divide the nav bar. */
export const menuHairlineClass = tw('mx-3 h-px shrink-0 bg-foreground/15 more-contrast:bg-foreground/40');
