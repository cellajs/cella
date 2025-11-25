import z from 'zod';
import { zGetPagesData } from '~/api.gen/zod.gen';

const getPagesQuerySchema = zGetPagesData.shape.query.unwrap();

// Search schemas, some are also used in project routes
export const pagesListSearchSchema = getPagesQuerySchema.pick({ q: true, sort: true, order: true, matchMode: true });

export const pagesDetailsSearchSchema = getPagesQuerySchema.pick({ q: true });

export const pagesSearchSchema = z.object({ ...pagesDetailsSearchSchema.shape, ...pagesListSearchSchema.shape });
