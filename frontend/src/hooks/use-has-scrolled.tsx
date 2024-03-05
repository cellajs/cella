import { useEffect, useState } from 'react';

// This hook is used to check if the user has scrolled
export const hasScrolled = () => {
  const [scrolled, setScrolled] = useState(false);

  const scrollListener = () => {
    setScrolled(true);
    window.removeEventListener('scroll', scrollListener);
  };

  window.addEventListener('scroll', scrollListener);

  // Cleanup just in case
  useEffect(() => {
    return () => {
      window.removeEventListener('scroll', scrollListener);
    };
  }, []);

  return {
    scrolled,
  };
};

export default hasScrolled;
