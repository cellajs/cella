import { tw } from '~/utils/tw';

/** Class of a docs collapsible's panel: below `md` it opens without the height keyframes, which run on the main thread and drop frames while the panel mounts its content. */
export const collapsiblePanelClass = tw('overflow-hidden md:data-closed:animate-collapsible-up md:data-open:animate-collapsible-down');
