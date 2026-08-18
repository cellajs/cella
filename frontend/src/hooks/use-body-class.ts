import { useEffect, useRef } from 'react';

/** Applies each class in the map to document.body while its value is true. */
export function useBodyClass(classMappings: Record<string, boolean>) {
  const addedClassesRef = useRef<Set<string>>(new Set());
  const prevRef = useRef<Record<string, boolean>>({});

  // Update classes on every render (prevRef skips no-ops)
  useEffect(() => {
    const bodyClassList = document.body.classList;
    const addedClasses = addedClassesRef.current;
    const prev = prevRef.current;

    for (const className in classMappings) {
      if (prev[className] === classMappings[className]) continue;
      if (classMappings[className]) {
        bodyClassList.add(className);
        addedClasses.add(className);
      } else {
        bodyClassList.remove(className);
        addedClasses.delete(className);
      }
    }
    prevRef.current = { ...classMappings };
  });

  useEffect(() => {
    return () => {
      const bodyClassList = document.body.classList;
      for (const className of addedClassesRef.current) {
        bodyClassList.remove(className);
      }
      addedClassesRef.current.clear();
      prevRef.current = {};
    };
  }, []);
}
