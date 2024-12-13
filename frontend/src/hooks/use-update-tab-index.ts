import type React from 'react';
import { useEffect } from 'react';

const useUpdateTabIndex = (ref: React.RefObject<HTMLDivElement>, isVisible: boolean) => {
  useEffect(() => {
    if (!ref.current) return;
    // ... rest of implementation
  }, [isVisible, ref]);
};

export default useUpdateTabIndex;
