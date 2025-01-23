import { useMatches } from '@tanstack/react-router';
import { config } from 'config';
import { useEffect } from 'react';

const isPWAInstalled = () => {
  return window.matchMedia('(display-mode: standalone)').matches;
};

// Custom hook for setting document title
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
      document.title = titles.join(' › ') + append;
    });
  }, [matches]);
};
