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
    const entries = Object.entries(fileMap);
    await Promise.all(entries.map(([key, file]) => set(key, file)));
  },
  async addFile(key: string, file: LocalFile): Promise<void> {
    console.debug(`Saving file with key: ${key}`);
    await set(key, file);
  },
  async getFile(key: string): Promise<LocalFile | undefined> {
    console.debug(`Retrieving file with key: ${key}`);
    return await get<LocalFile>(key);
  },
  async removeFile(key: string): Promise<void> {
    console.debug(`Deleting file with key: ${key}`);
    await del(key);
  },
  async clearAll(): Promise<void> {
    console.debug('Clearing all files');
    await clear();
  },
  async listKeys(): Promise<string[]> {
    console.debug('Listing all file keys');
    return await keys();
  },
};
