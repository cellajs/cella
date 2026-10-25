import { useMatch } from '@tanstack/react-router';

/** Whether the about route is active, for the nav and footer that every marketing page shares. */
export const useIsAboutPage = () => useMatch({ from: '/_public/_marketing/about', shouldThrow: false, select: () => true }) ?? false;
