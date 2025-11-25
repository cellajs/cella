import type z from 'zod';
import { pagesListSearchSchema } from './schemas';

export type PageStatus = 'unpublished' | 'published' | 'archived';

export type PagesSearch = z.infer<typeof pagesListSearchSchema>;
