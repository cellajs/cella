import { appConfig } from 'config';
import type { GetPagesData } from '~/api.gen';
import { createEntityKeys } from '../entities/create-query-keys';

export const pagesLimit = appConfig.requestLimits.pages;

type PageFilters = Omit<GetPagesData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<PageFilters>('page');

/**
 * Page query keys.
 */
export const pageQueryKeys = keys;

// #endregion
