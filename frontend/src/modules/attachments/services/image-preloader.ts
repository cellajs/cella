import * as Sentry from '@sentry/react';
import type { Attachment } from '~/api.gen';
import { getPresignedUrl } from '~/api.gen';
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

      // Filter out attachments that are already cached
      const uncachedAttachments = await this.filterUncachedAttachments(attachments);

      if (!uncachedAttachments.length) {
        console.log('All attachments already cached');
        return;
      }

      this.downloadAndCacheImage(uncachedAttachments);
    } catch (error) {
      console.error('Failed to preload attachments:', error);
      Sentry.captureException(error);
    }
  }

  /**
   * Filter out attachments that are already cached in the database
   */
  private async filterUncachedAttachments(attachments: Attachment[]): Promise<Attachment[]> {
    const uncached: Attachment[] = [];

    for (const attachment of attachments) {
      const cachedFile = await dexieAttachmentStorage.getFile(attachment.id);
      if (!cachedFile) {
        uncached.push(attachment);
      }
    }

    return uncached;
  }

  /**
   * Download and cache images
   */
  private async downloadAndCacheImage(attachments: Attachment[]): Promise<void> {
    const queries = attachments.map(async (attachment) => {
      try {
        const { name, contentType, originalKey, public: isPublic, id } = attachment;

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
        }) as any;

        // Store in database using the existing storage mechanism
        await dexieAttachmentStorage.addFiles(
          { [id]: file },
          {
            organizationId: attachment.organizationId,
            templateId: 'attachment',
            public: isPublic || false,
          },
        );

        console.log(`Cached attachment: ${name}`);
      } catch (error) {
        console.error(`Failed to cache attachment ${attachment.name}:`, error);
        Sentry.captureException(error);
      }
    });

    await Promise.allSettled(queries);
  }
}

export const imagePreloader = ImagePreloader.getInstance();
