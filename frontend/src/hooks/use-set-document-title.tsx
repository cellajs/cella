import { useMatches } from '@tanstack/react-router';
import { config } from 'config';
import { useEffect } from 'react';

const isPWAInstalled = () => {
  return window.matchMedia('(display-mode: standalone)').matches;
};

/**
 * Custom hook to set the document title based on the current route matches.
 * It gathers the page titles from route data and updates the document title dynamically.
 * If the app is installed as a PWA, the app name is omitted from the title.
 *
 */
export const useSetDocumentTitle = () => {
  const matches = useMatches();

  useEffect(() => {
    const breadcrumbPromises = [...matches]
      .map((match) => {
        const { staticData } = match;
        return staticData.pageTitle;
      })
      .filter(Boolean);

    void Promise.all(breadcrumbPromises).then((titles) => {
      const append = isPWAInstalled() ? '' : (titles.length && ' · ') + config.name;

      // If no titles are found, set the document title to the app name
      if (titles.length === 0) {
        document.title = config.name;
        return;
      }

      document.title = titles.join(' › ') + append;
    });
  }, [matches]);
};
