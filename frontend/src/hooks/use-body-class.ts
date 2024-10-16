import { useEffect, useMemo } from 'react';

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
