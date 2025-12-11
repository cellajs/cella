import { useCallback } from 'react';
import { imagePreloader } from '~/modules/attachments/services/image-preloader';

/**
 * Hook for using the image preloader service
 */
export const useImagePreloader = () => {
  /**
   * Preload all available image attachments for an organization
   */
  const preloadAll = useCallback((organizationId: string) => {
    return imagePreloader.preloadAllAttachments(organizationId);
  }, []);

  /**
   * Preload specific attachments
   */
  const preloadAttachments = useCallback((attachments: any[], organizationId: string) => {
    return imagePreloader.preloadAttachments(attachments, organizationId);
  }, []);

  /**
   * Preload a single attachment
   */
  const preloadAttachment = useCallback((attachment: any, organizationId: string) => {
    return imagePreloader.preloadAttachment(attachment, organizationId);
  }, []);

  /**
   * Get preload status for an attachment
   */
  const getStatus = useCallback((attachmentId: string, organizationId: string) => {
    return imagePreloader.getPreloadStatus(attachmentId, organizationId);
  }, []);

  /**
   * Get preload statistics for an organization
   */
  const getStats = useCallback((organizationId: string) => {
    return imagePreloader.getPreloadStats(organizationId);
  }, []);

  /**
   * Clear completed items from queue
   */
  const clearCompleted = useCallback(() => {
    imagePreloader.clearCompletedItems();
  }, []);

  return {
    preloadAll,
    preloadAttachments,
    preloadAttachment,
    getStatus,
    getStats,
    clearCompleted,
  };
};
