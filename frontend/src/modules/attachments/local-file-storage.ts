import { clear, del, get, keys, set } from 'idb-keyval';
import type { LocalFile } from '~/lib/imado';

/**
 * Store files in IndexedDB when user is offline or when Imado is not configured
 *
 * @link https://github.com/jakearchibald/idb-keyval
 */
export const LocalFileStorage = {
  async addFiles(fileMap: Record<string, LocalFile>): Promise<void> {
    console.debug('Saving multiple files');
    try {
      const entries = Object.entries(fileMap);
      await Promise.all(entries.map(([key, file]) => set(key, file)));
    } catch (error) {
      console.error('Failed to save multiple files:', error);
    }
  },

  async addFile(key: string, file: LocalFile): Promise<void> {
    console.debug(`Saving file with key: ${key}`);
    try {
      await set(key, file);
    } catch (error) {
      console.error(`Failed to save file (${key}):`, error);
    }
  },

  async getFile(key: string): Promise<LocalFile | undefined> {
    console.debug(`Retrieving file with key: ${key}`);
    try {
      return await get<LocalFile>(key);
    } catch (error) {
      console.error(`Failed to retrieve file (${key}):`, error);
      return undefined;
    }
  },

  async removeFile(key: string): Promise<void> {
    console.debug(`Deleting file with key: ${key}`);
    try {
      await del(key);
    } catch (error) {
      console.error(`Failed to delete file (${key}):`, error);
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
