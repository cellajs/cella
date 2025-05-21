import { del, get, keys, set } from 'idb-keyval';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/api';
import { nanoid } from '~/utils/nanoid';

/**
 * Store files in IndexedDB when user is offline or when s3 is not configured
 *
 * @link https://github.com/jakearchibald/idb-keyval
 */
export const LocalFileStorage = {
  async addData(files: Record<string, CustomUppyFile>, tokenQuery: UploadTokenQuery): Promise<void> {
    try {
      await set(tokenQuery.organizationId ?? nanoid(), { files, tokenQuery });
    } catch (error) {
      console.error('Failed to save multiple files:', error);
    }
  },

  async getData(organizationId: string) {
    try {
      return await get<{ files: Record<string, CustomUppyFile>; tokenQuery: UploadTokenQuery }>(organizationId);
    } catch (error) {
      console.error('Failed to save multiple files:', error);
    }
  },

  async getFile(fileId: string): Promise<CustomUppyFile | undefined> {
    try {
      const storageKeys = await keys();
      if (!storageKeys.length) return undefined;
      for (const groupKey of storageKeys) {
        const group = await get<{ files: Record<string, CustomUppyFile> }>(groupKey);
        if (!group) return undefined;
        return group.files[fileId];
      }
      return undefined;
    } catch (error) {
      console.error(`Failed to retrieve file (${fileId}):`, error);
      return undefined;
    }
  },

  async removeData(organizationId: string): Promise<void> {
    try {
      await del(organizationId);
    } catch (error) {
      console.error(`Failed to delete file (${organizationId}):`, error);
    }
  },
};
