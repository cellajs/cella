import { tw } from '~/utils/tw';
/** Positions a nav sheet next to the sidebar icon bar on sm+; pushes content when keepNavOpen. */
export const navSheetClassName = tw(
  'xs:max-w-80 max-sm:shadow-[0_0_2px_5px_rgba(0,0,0,0.1)] sm:left-16 sm:z-90 sm:w-80 sm:group-[.keep-nav-open]/body:border-r sm:group-[.keep-nav-open]/body:shadow-none dark:max-sm:shadow-[0_0_2px_5px_rgba(255,255,255,0.05)]',
);
