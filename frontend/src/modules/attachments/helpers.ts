import { uploadTemplates } from 'config/templates';
import { Attachment } from '~/api.gen';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUserStore } from '~/store/user';
import { nanoid } from '~/utils/nanoid';

const baseAttachmentValues = {
  entityType: 'attachment' as const,
  convertedContentType: null,
  convertedKey: null,
  thumbnailKey: null,
  modifiedAt: null,
  modifiedBy: null,
  keywords: '',
};

export const parseUploadedAttachments = (
  result: UploadedUppyFile<'attachment'>,
  organizationId: string,
): Attachment[] => {
  const createdBy = useUserStore.getState().user.id;
  const createdAt = new Date().toISOString();

  // Process original files
  const originalFiles = result[':original'] ?? [];

  const attachmentsById = new Map<string, Attachment>();
  const groupId = originalFiles.length > 1 ? nanoid() : null;

  for (const file of originalFiles) {
    const { size, url, mime, original_name, original_id, user_meta } = file;

    const id = original_id || nanoid();

    const filename = original_name || user_meta?.name || 'file';
    const extIndex = filename.lastIndexOf('.');
    const name = extIndex > 0 ? filename.substring(0, extIndex) : filename;

    attachmentsById.set(id, {
      id,
      size: String(size ?? 0),
      contentType: mime,
      filename,
      name,
      description: '',
      public: user_meta?.public === 'true',
      bucketName: user_meta?.bucketName,
      originalKey: url,
      groupId,
      organizationId,
      createdBy,
      createdAt,
      ...baseAttachmentValues,
    });
  }

  //  Process converted + thumbnail variants
  const steps = uploadTemplates.attachment.use.filter((step) => step !== ':original');

  for (const step of steps) {
    const files = result[step] ?? [];

    for (const { url, mime, original_id } of files) {
      if (!original_id) continue;

      const target = attachmentsById.get(original_id);
      if (!target) continue;

      if (step.startsWith('converted_')) {
        target.convertedKey = url;
        target.convertedContentType = mime;
      }

      if (step.startsWith('thumb_')) {
        target.thumbnailKey = url;
      }
    }
  }

  return Array.from(attachmentsById.values());
};
