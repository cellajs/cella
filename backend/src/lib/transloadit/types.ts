import type { UploadTemplateId } from 'config';

import type { uploadTemplates } from '#/lib/transloadit/templates';

export type TemplateStepKeys<T extends UploadTemplateId> = (typeof uploadTemplates)[T]['use'][number];
