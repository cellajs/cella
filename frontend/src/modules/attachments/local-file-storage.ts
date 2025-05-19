import { clear, del, delMany, get, keys, set, setMany } from 'idb-keyval';
import type { CustomUppyFile } from '~/modules/common/uploader/types';

/**
 * Store files in IndexedDB when user is offline or when s3 is not configured
 *
 * @link https://github.com/jakearchibald/idb-keyval
 */
export const LocalFileStorage = {
  async addFiles(fileMap: Record<string, CustomUppyFile>): Promise<void> {
    // console.debug('Saving multiple files');
    try {
      const validFileMap = Object.entries(fileMap);
      await setMany(validFileMap);
    } catch (error) {
      console.error('Failed to save multiple files:', error);
    }
  },

  async addFile(key: string, file: CustomUppyFile): Promise<void> {
    // console.debug(`Saving file with key: ${key}`);
    try {
      await set(key, file);
    } catch (error) {
      console.error(`Failed to save file (${key}):`, error);
    }
  },

  async getFile(key: string): Promise<CustomUppyFile | undefined> {
    // console.debug(`Retrieving file with key: ${key}`);
    try {
      return await get<CustomUppyFile>(key);
    } catch (error) {
      console.error(`Failed to retrieve file (${key}):`, error);
      return undefined;
    }
  },

  async removeFile(key: string): Promise<void> {
    // console.debug(`Deleting file with key: ${key}`);
    try {
      await del(key);
    } catch (error) {
      console.error(`Failed to delete file (${key}):`, error);
    }
  },

  async removeFiles(keys: string[]): Promise<void> {
    console.debug('Deleting files');
    try {
      await delMany(keys);
    } catch (error) {
      console.error('Failed to delete files:', error);
    }
  },

  async clearAll(): Promise<void> {
    console.debug('Clearing all files');
    try {
      await clear();
    } catch (error) {
      console.error('Failed to clear all files:', error);
    }
  },

  async listKeys(): Promise<string[]> {
    console.debug('Listing all file keys');
    try {
      return await keys();
    } catch (error) {
      console.error('Failed to list keys:', error);
      return [];
    }
  },
};
