import { snakeCamelMapper } from '@electric-sql/client';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { createCollection } from '@tanstack/react-db';
import { appConfig } from 'config';
import { t } from 'i18next';
import { createPage, deletePages, updatePage } from '~/api.gen';
import { zPage } from '~/api.gen/zod.gen';
import { clientConfig } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/service';
import { baseBackoffOptions as backoffOptions, handleSyncError } from '~/utils/electric-utils';

/**
 * Show success toast for page operations
 */
const showSuccessToast = (count: number, action: 'create' | 'update' | 'delete') => {
  const resourceKey = count === 1 ? 'common:page' : 'common:pages';
  const messageKey = count === 1 ? `common:success.${action}_resource` : `common:success.${action}_counted_resources`;

  const message =
    count === 1
      ? t(messageKey, { resource: t(resourceKey) })
      : t(messageKey, { count, resources: t(resourceKey).toLowerCase() });

  toaster(message, 'success');
};

/**
 * Handle errors for page operations
 */
const handleError = (action: 'create' | 'update' | 'delete' | 'deleteMany') => {
  if (action === 'deleteMany') toaster(t('error:delete_resources', { resources: t('common:pages') }), 'error');
  else toaster(t(`error:${action}_resource`, { resource: t('common:page') }), 'error');
};

// Internal implementation for creating pages collection
const createPagesCollectionImpl = () =>
  createCollection(
    electricCollectionOptions({
      id: 'pages',
      schema: zPage,
      getKey: (item) => item.id,
      shapeOptions: {
        url: new URL('/pages/sync-pages', appConfig.backendUrl).href,
        params: { table: 'pages' },
        backoffOptions,
        fetchClient: clientConfig.fetch,
        columnMapper: snakeCamelMapper(),
        onError: (error) => handleSyncError(error),
      },
      // Mutation callbacks for optimistic updates
      onInsert: async ({ transaction }) => {
        try {
          const newPages = transaction.mutations.map(({ modified }) => modified);
          // API expects single page creation
          for (const page of newPages) {
            await createPage({ body: page });
          }
          showSuccessToast(newPages.length, 'create');
        } catch (err) {
          handleError('create');
          throw err; // Re-throw to trigger rollback
        }
      },
      onUpdate: async ({ transaction }) => {
        try {
          for (const { original, changes } of transaction.mutations) {
            await updatePage({ body: changes, path: { id: original.id } });
          }
          showSuccessToast(transaction.mutations.length, 'update');
        } catch (err) {
          handleError('update');
          throw err;
        }
      },
      onDelete: async ({ transaction }) => {
        try {
          const ids = transaction.mutations.map(({ modified }) => modified.id);
          await deletePages({ body: { ids } });
          showSuccessToast(ids.length, 'delete');
        } catch (err) {
          handleError(transaction.mutations.length > 1 ? 'deleteMany' : 'delete');
          throw err;
        }
      },
    }),
  );

// Cache collection to avoid recreating on every call
// This prevents breaking the sync connection when routes re-render
type PagesCollection = ReturnType<typeof createPagesCollectionImpl>;

let pagesCollectionCache: PagesCollection | null = null;

/**
 * Get or create a pages collection.
 * Collection is cached to maintain sync connection across route changes.
 */
export const initPagesCollection = (): PagesCollection => {
  if (pagesCollectionCache) return pagesCollectionCache;

  const collection = createPagesCollectionImpl();
  pagesCollectionCache = collection;
  return collection;
};
