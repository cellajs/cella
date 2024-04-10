import { useEffect } from 'react';

/**
 * useHideElementsById - A custom React hook to hide elements by their IDs.
 *
 * @param {string[]} ids - An array of element IDs to hide.
 */
const useHideElementsById = (ids: string[]): void => {
  useEffect(() => {
    const hiddenElements: HTMLElement[] = [];

    for (let i = 0; i < ids.length; i++) {
      const element = document.getElementById(ids[i]);
      if (element) {
        element.style.display = 'none';
        hiddenElements.push(element);
      }
    }

    return () => {
      for (let i = 0; i < hiddenElements.length; i++) {
        hiddenElements[i].style.display = '';
      }
    };
  }, [ids]);
};

export default useHideElementsById;
