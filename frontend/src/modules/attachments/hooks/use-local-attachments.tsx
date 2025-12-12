// import { useLiveQuery } from 'dexie-react-hooks';
// import { useMemo } from 'react';
// import { attachmentStorage } from '~/modules/attachments/services/dexie-attachment-storage';

// /**
//  * Hook to get all local attachments for an organization
//  */
// export const useLocalAttachments = (organizationId: string) => {
//   const localFiles = useLiveQuery(() => attachmentStorage.getFilesByOrganization(organizationId), [organizationId], []);

//   return useMemo(
//     () => ({
//       files: localFiles || [],
//       isLoading: localFiles === undefined,
//       hasFiles: (localFiles?.length || 0) > 0,
//     }),
//     [localFiles],
//   );
// };

// /**
//  * Hook to get local attachments that need syncing
//  */
// export const useLocalAttachmentsNeedingSync = (organizationId: string) => {
//   const filesNeedingSync = useLiveQuery(() => attachmentStorage.getFilesBySyncStatus(organizationId, 'idle'), [organizationId], []);

//   return useMemo(
//     () => ({
//       files: filesNeedingSync || [],
//       isLoading: filesNeedingSync === undefined,
//       hasFiles: (filesNeedingSync?.length || 0) > 0,
//       count: filesNeedingSync?.length || 0,
//     }),
//     [filesNeedingSync],
//   );
// };

// /**
//  * Hook to get processing attachments
//  */
// export const useProcessingAttachments = (organizationId: string) => {
//   const processingFiles = useLiveQuery(() => attachmentStorage.getFilesBySyncStatus(organizationId, 'processing'), [organizationId], []);

//   return useMemo(
//     () => ({
//       files: processingFiles || [],
//       isLoading: processingFiles === undefined,
//       hasFiles: (processingFiles?.length || 0) > 0,
//       count: processingFiles?.length || 0,
//     }),
//     [processingFiles],
//   );
// };

// /**
//  * Hook to get failed attachments
//  */
// export const useFailedAttachments = (organizationId: string) => {
//   const failedFiles = useLiveQuery(() => attachmentStorage.getFilesBySyncStatus(organizationId, 'failed'), [organizationId], []);

//   return useMemo(
//     () => ({
//       files: failedFiles || [],
//       isLoading: failedFiles === undefined,
//       hasFiles: (failedFiles?.length || 0) > 0,
//       count: failedFiles?.length || 0,
//     }),
//     [failedFiles],
//   );
// };

// /**
//  * Hook to get a specific local attachment by file ID
//  */
// export const useLocalAttachment = (fileId: string) => {
//   const file = useLiveQuery(() => attachmentStorage.getFile(fileId), [fileId]);

//   return useMemo(
//     () => ({
//       file: file || undefined,
//       isLoading: file === undefined,
//       exists: !!file,
//     }),
//     [file],
//   );
// };

// /**
//  * Hook to get files in a specific batch
//  */
// export const useLocalAttachmentBatch = (batchId: string) => {
//   const batchFiles = useLiveQuery(() => attachmentStorage.getBatchFiles(batchId), [batchId], []);

//   return useMemo(
//     () => ({
//       files: batchFiles || [],
//       isLoading: batchFiles === undefined,
//       hasFiles: (batchFiles?.length || 0) > 0,
//       count: batchFiles?.length || 0,
//     }),
//     [batchFiles],
//   );
// };
