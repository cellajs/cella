import { fetchAllPages, type PageRequest } from '~/query/basic/fetch-all-pages';
import type { QueryData } from '~/query/types';

/** Rows per export page: the backend reads at most 1000 per page. */
export const exportChunkSize = 1000;

/** Every row of a list for an export, page by page; one capped read would truncate it. */
export const fetchAllRows = async <T>(fetchPage: (page: PageRequest) => Promise<QueryData<T>>): Promise<T[]> =>
  (await fetchAllPages(fetchPage, exportChunkSize)).results;
