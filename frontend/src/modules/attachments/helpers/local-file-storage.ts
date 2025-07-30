import { del, get, keys, set } from 'idb-keyval';
import type { AttachmentDeletionPartition } from '~/modules/attachments/types';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import type { UploadTockenQuery } from '~/modules/me/types';
import { nanoid } from '~/utils/nanoid';

type StoredOfflineData = {
  files: Record<string, CustomUppyFile>;
  tokenQuery: UploadTockenQuery;
  syncStatus: SyncStatus;
};

type SyncStatus = 'idle' | 'processing';

/**
 * Store files in IndexedDB when user is offline or when s3 is not configured
 *
 * @link https://github.com/jakearchibald/idb-keyval
 */
export const LocalFileStorage = {
  async addData(files: Record<string, CustomUppyFile>, tokenQuery: UploadTockenQuery): Promise<void> {
    if (!tokenQuery.organizationId) throw new Error('No organizationId provided');
    const { organizationId: key } = tokenQuery;

    try {
      const existing = await get<StoredOfflineData>(key);

      if (existing?.syncStatus === 'processing') {
        // Archive the processing batch under a new key
        await set(`${key}-${nanoid(4)}`, existing);

        // Create a fresh new entry for new files (do NOT continue merging below)
        await set(key, { files, tokenQuery, syncStatus: 'idle' });

        return;
      }

      // Otherwise, merge with existing idle files
      const mergedFiles = { ...(existing?.files ?? {}), ...files };
      await set(key, { files: mergedFiles, tokenQuery, syncStatus: 'idle' });
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  },

  async getData(organizationId: string) {
    try {
      return await get<StoredOfflineData>(organizationId);
    } catch (error) {
      console.error('Failed to retrieve data:', error);
    }
  },

  async getFile(fileId: string): Promise<CustomUppyFile | undefined> {
    try {
      const storageKeys = await keys();
      if (!storageKeys.length) return undefined;
      for (const groupKey of storageKeys) {
        const group = await get<StoredOfflineData>(groupKey);
        if (!group) return undefined;
        return group.files[fileId];
      }
      return undefined;
    } catch (error) {
      console.error(`Failed to retrieve file (${fileId}):`, error);
      return undefined;
    }
  },

  async setSyncStatus(orgId: string, syncStatus: SyncStatus): Promise<void> {
    try {
      const data = await get<StoredOfflineData>(orgId);
      if (!data) return;
      await set(orgId, { ...data, syncStatus });
    } catch (error) {
      console.error(`Failed to set new sync status for ${orgId}:`, error);
      return undefined;
    }
  },

  async removeData(organizationId: string): Promise<void> {
    try {
      await del(organizationId);
    } catch (error) {
      console.error(`Failed to delete data (${organizationId}):`, error);
    }
  },

  async removeFiles(fileIds: string[]): Promise<AttachmentDeletionPartition> {
    const remaining = new Set(fileIds); // files NOT found locally
    const localRemoved = new Set<string>(); // files deleted locally

    try {
      const storageKeys = await keys();
      if (!storageKeys.length) return { localDeleted: [], backendToDelete: fileIds };

      const fileIdSet = new Set(fileIds);

      const groupEntries = await Promise.all(
        storageKeys.map(async (key) => {
          const group = await get<StoredOfflineData>(key);
          return group?.files ? ([key, group] as const) : null;
        }),
      );

      await Promise.all(
        groupEntries
          .filter((entry): entry is [string, StoredOfflineData] => !!entry && typeof entry[1]?.files === 'object')
          .map(async ([groupKey, group]) => {
            const fileKeys = Object.keys(group.files);

            const allFilesMatch = fileKeys.every((id) => fileIdSet.has(id));

            if (allFilesMatch) {
              // All files in the group are being deleted
              fileKeys.forEach((id) => {
                remaining.delete(id);
                localRemoved.add(id);
              });

              await del(groupKey);
              return;
            }

            // Partial match: delete only matching files
            let modified = false;

            for (const fileId of Object.keys(group.files)) {
              if (fileIdSet.has(fileId)) {
                delete group.files[fileId];
                remaining.delete(fileId); // no longer needs backend deletion
                localRemoved.add(fileId); // tracked as removed locally
                modified = true;
              }
            }

            if (modified) await set(groupKey, group);
          }),
      );
    } catch (error) {
      console.error('Failed to remove files:', error);
    }

    return {
      localDeleted: Array.from(localRemoved),
      backendToDelete: Array.from(remaining), // those not found locally, should be sent to backend
    };
  },
};
