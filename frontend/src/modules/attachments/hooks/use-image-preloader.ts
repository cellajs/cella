import { useCallback } from 'react';
import { imagePreloader } from '~/modules/attachments/services/image-preloader';

/**
 * Hook for using the image preloader service
 */
export const useImagePreloader = () => {
  /**
   * Preload all available image attachments
   */
  const preloadAll = useCallback((attachments: any[]) => {
    return imagePreloader.preloadAllAttachments(attachments);
  }, []);

  return {
    preloadAll,
  };
};
