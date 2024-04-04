import { useEffect } from 'react';
import { useMatches } from '@tanstack/react-router';
import { config } from 'config';

// Custom hook for setting document title
export const useBuildDocumentTitle = () => {
  const matches = useMatches();

  useEffect(() => {
    const breadcrumbPromises = [...matches]
      .map((match) => {
        const { staticData } = match;
        return staticData.pageTitle;
      })
      .filter(Boolean);

    void Promise.all(breadcrumbPromises).then((titles) => {
      document.title = titles.join(' › ') + (titles.length && ' · ') + config.name;
    });
  }, [matches]);
};
