import { useEffect, useRef } from 'react';

/**
 * Custom hook to conditionally add/remove body classes based on the provided class mappings.
 *
 * This hook allows you to dynamically update the body's class list based on a set of class mappings.
 * It will add classes to the body if their corresponding value in `classMappings` is `true`, and remove them if `false`.
 * The hook also cleans up the added classes when the component is unmounted.
 *
 * @param classMappings - An object where keys are class names and values are booleans indicating whether the class should be applied or not.
 */
function useBodyClass(classMappings: { [key: string]: boolean }) {
  // Use ref to track which classes this hook instance has added
  const addedClassesRef = useRef<Set<string>>(new Set());

  // Serialize for stable dependency (only recompute when values change)
  const serialized = JSON.stringify(classMappings);

  useEffect(() => {
    const bodyClassList = document.body.classList;
    const addedClasses = addedClassesRef.current;

    // Apply current mappings
    for (const className in classMappings) {
      if (classMappings[className]) {
        bodyClassList.add(className);
        addedClasses.add(className);
      } else {
        bodyClassList.remove(className);
        addedClasses.delete(className);
      }
    }

    // Cleanup: remove only classes this hook instance added
    return () => {
      for (const className of addedClasses) {
        bodyClassList.remove(className);
      }
      addedClasses.clear();
    };
  }, [serialized]);
}

export default useBodyClass;
