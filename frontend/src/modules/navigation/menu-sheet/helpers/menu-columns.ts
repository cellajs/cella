import { tw } from '~/utils/tw';

/** Puts a `size-8` icon and the text after it on the columns of a `MenuSheetItem`, in a row at the menu's own inset. */
export const menuColumnsClass = tw('gap-4 px-3');

/** The line that divides a nav sheet: under a menu sheet's organization and above the sheet's panels, the color of the line under a page's tabs. */
export const menuHairlineClass = tw('bg-border mx-3 h-px shrink-0');
