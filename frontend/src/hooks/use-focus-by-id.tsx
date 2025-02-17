import { useEffect } from 'react';

/**
 * Hook to focus an element by its ID.
 *
 * @param id - The ID of the element to focus.
 *
 */
// TODO not used or in raak?
const useFocusById = (id: string) => {
  useEffect(() => {
    const element = document.getElementById(id);
    if (!element) return;
    element.focus();
  }, [id]);
};

export default useFocusById;
