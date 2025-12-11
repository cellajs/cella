import * as Sentry from '@sentry/react';
import type { Attachment } from '~/api.gen';
import { getAttachments, getPresignedUrl } from '~/api.gen';
import { dexieAttachmentStorage } from './dexie-attachment-storage';

/**
 * Image preloader service that automatically downloads and caches attachment images
 * for offline-first access using parallel presigned URLs and batch downloads
 */
export class ImagePreloader {
  private static instance: ImagePreloader;

  private constructor() {}

  static getInstance(): ImagePreloader {
    if (!ImagePreloader.instance) {
      ImagePreloader.instance = new ImagePreloader();
    }
    return ImagePreloader.instance;
  }

  /**
   * Preload all available image attachments for an organization
   */
  async preloadAllAttachments(attachments: Attachment[]): Promise<void> {
    try {
      if (!attachments.length) return;

      this.downloadAndCacheImage(attachments);
    } catch (error) {
      console.error('Failed to preload attachments:', error);
      Sentry.captureException(error);
    }
  }

  /**
   * Download and cache a single image
   */
  private async downloadAndCacheImage(attachment: Attachment[]): Promise<void> {
    const queries = attachment.map(async ({ name, contentType, originalKey, public: isPublic }) => {
      const imageUrl = await getPresignedUrl({ query: { key: originalKey, isPublic } });
      // Download the image file
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.statusText}`);
      }

      const blob = await imageResponse.blob();

      // Create a file-like object for storage
      const file = new File([blob], name || 'image', {
        type: contentType || blob.type,
      });
      console.log('🚀 ~ ImagePreloader ~ downloadAndCacheImage ~ file:', file);
    });

    await Promise.allSettled(queries);
  }
}

export const imagePreloader = ImagePreloader.getInstance();
