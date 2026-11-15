import { useEffect } from 'react';

/** Applies each class in the map to document.body while its value is true. */
export function useBodyClass(classMappings: Record<string, boolean>) {
  // Keyed on the names, not the map: callers pass a fresh object each render
  const activeClasses = Object.keys(classMappings)
    .filter((className) => classMappings[className])
    .join(' ');

  useEffect(() => {
    if (!activeClasses) return;
    const classNames = activeClasses.split(' ');
    document.body.classList.add(...classNames);
    return () => document.body.classList.remove(...classNames);
  }, [activeClasses]);
}
