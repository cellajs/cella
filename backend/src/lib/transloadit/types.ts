import type { UploadTemplateId } from 'config';

import type { uploadTemplates } from '#/modules/me/helpers/upload-templates';

export type TemplateStepKeys<T extends UploadTemplateId> = (typeof uploadTemplates)[T]['use'][number];
