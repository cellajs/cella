import { clear, del, delMany, get, keys, set, setMany, values } from 'idb-keyval';
import type { LocalFile } from '~/lib/imado/types';
import type { UploadUppyProps } from './upload/upload-uppy';

type ImageMode = NonNullable<UploadUppyProps['imageMode']>;

type StoredFiles = LocalFile & { meta: LocalFile['meta'] & { imageMode: ImageMode } };

/**
 * Store files in IndexedDB when user is offline or when Imado is not configured
 *
 * @link https://github.com/jakearchibald/idb-keyval
 */
export const LocalFileStorage = {
  async addFiles(imageMode: ImageMode, fileMap: Record<string, LocalFile>): Promise<void> {
    console.debug('Saving multiple files');
    try {
      const updatedFileMap: [IDBValidKey, StoredFiles][] = Object.entries(fileMap).map(([key, file]) => [
        key,
        { ...file, meta: { ...file.meta, imageMode } },
      ]);

      await setMany(updatedFileMap);
    } catch (error) {
      console.error('Failed to save multiple files:', error);
    }
  },

  async addFile(key: string, file: StoredFiles): Promise<void> {
    console.debug(`Saving file with key: ${key}`);
    try {
      await set(key, file);
    } catch (error) {
      console.error(`Failed to save file (${key}):`, error);
    }
  },

  async getFile(key: string): Promise<StoredFiles | undefined> {
    console.debug(`Retrieving file with key: ${key}`);
    try {
      return await get<StoredFiles>(key);
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

  async listValues(): Promise<StoredFiles[]> {
    console.debug('Listing all file values');
    try {
      return await values();
    } catch (error) {
      console.error('Failed to list values:', error);
      return [];
    }
  },
};
