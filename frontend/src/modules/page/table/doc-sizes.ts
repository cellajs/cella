import { docsSizes } from 'virtual:docs-sizes';
import { create } from 'zustand';
import { pathToSlug } from '~/modules/page/content';

type DocSizes = typeof docsSizes;

const bySlug = (sizes: DocSizes) => new Map(Object.entries(sizes).map(([path, size]) => [pathToSlug(path), size]));

const useDocSizesStore = create(() => ({ sizes: bySlug(docsSizes) }));

if (import.meta.hot) import.meta.hot.on('docs:sizes', (sizes: DocSizes) => useDocSizesStore.setState({ sizes: bySlug(sizes) }));

/** Characters and words of a page body and the documents it imports, counted at build time and on every save in development. */
export const useDocSize = (slug: string) => useDocSizesStore((state) => state.sizes.get(slug));
