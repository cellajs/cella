import { useEffect, useRef } from 'react';

/**
 * Custom hook to conditionally add/remove body classes based on the provided class mappings.
 *
 * @param classMappings - An object where keys are class names and values are booleans indicating whether the class should be applied or not.
 */
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

  // Cleanup only on unmount
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
