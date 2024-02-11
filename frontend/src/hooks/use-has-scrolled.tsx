import { useEffect, useState } from 'react';

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
