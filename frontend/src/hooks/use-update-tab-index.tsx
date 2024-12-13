import { useEffect } from 'react';

// Custom hook for set or remove 'tabindex' attribute
const useUpdateTabIndex = (ref: React.RefObject<HTMLDivElement | null>, isVisible: boolean) => {
  useEffect(() => {
    if (!ref.current) return;

    const elements = ref.current.querySelectorAll<HTMLElement>('*');
    for (const el of elements) {
      if (isVisible) el.removeAttribute('tabindex');
      else el.setAttribute('tabindex', '-1');
    }
  }, [ref, isVisible]);
};

export default useUpdateTabIndex;
