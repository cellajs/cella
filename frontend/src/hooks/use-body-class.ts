import { useEffect, useMemo } from 'react';

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
  // Memoize classMappings to prevent unnecessary re-renders
  const stableClassMappings = useMemo(() => classMappings, [JSON.stringify(classMappings)]);

  useEffect(() => {
    const bodyClassList = document.body.classList;
    const classNames = Object.keys(stableClassMappings);

    // Use a for loop to add/remove classes
    for (let i = 0; i < classNames.length; i++) {
      const className = classNames[i];
      if (stableClassMappings[className]) {
        if (!bodyClassList.contains(className)) bodyClassList.add(className);
      } else {
        if (bodyClassList.contains(className)) bodyClassList.remove(className);
      }
    }

    // Cleanup: remove all added classes on unmount
    return () => {
      for (let i = 0; i < classNames.length; i++) {
        const className = classNames[i];
        if (bodyClassList.contains(className)) bodyClassList.remove(className);
      }
    };
  }, [stableClassMappings]);
}

export default useBodyClass;
