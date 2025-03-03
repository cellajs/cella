import type { UppyOptions } from '@uppy/core';
import { clear, del, get, getMany, keys, set, setMany } from 'idb-keyval';
import type { LocalFile, UppyBody, UppyMeta } from '~/lib/imado';
import type { UploadUppyProps } from '~/modules/attachments/upload/upload-uppy';
import { nanoid } from '~/utils/nanoid';

type ImadoRetryOptions = UppyOptions<UppyMeta, UppyBody> & { type: UploadUppyProps['uploadType']; organizationId?: string };

type ImadoRetryProps = { options: ImadoRetryOptions; fileMap: Record<string, LocalFile> };

/**
 * Store files in IndexedDB when user is offline or when Imado is not configured
 *
 * @link https://github.com/jakearchibald/idb-keyval
 */
export const LocalFileStorage = {
  async addImadoRetry({ options, fileMap }: ImadoRetryProps): Promise<void> {
    try {
      const key = `imado-retry-${nanoid()}`;
      // Remove non-serializable properties
      const serializableOptions = JSON.parse(JSON.stringify(options));

      await set(key, { options: serializableOptions, fileMap });

      await this.addFiles(fileMap);
    } catch (error) {
      console.error('Failed to save multiple files:', error);
    }
  },

  async addFiles(fileMap: Record<string, LocalFile>): Promise<void> {
    console.debug('Saving multiple files');
    try {
      await setMany(Object.entries(fileMap));
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

  async getRetryOptions(): Promise<ImadoRetryProps[] | undefined> {
    console.debug('Retrieving retry options');
    try {
      const storedKeys = await this.listKeys();
      const retryUploadKeys = storedKeys.filter((key) => key.startsWith('imado-retry-'));
      return await getMany<ImadoRetryProps>(retryUploadKeys);
    } catch (error) {
      console.error('Failed to retrieve retry options:', error);
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
