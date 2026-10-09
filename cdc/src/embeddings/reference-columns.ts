import { appConfig } from 'shared';

/** Per host product: the embedding column names it declares, each with the product embedded there. */
const columnsByHost = new Map<string, Map<string, string>>();
for (const { embeddedProduct, hostProduct, hostColumn } of appConfig.productEmbeddings) {
  const columns = columnsByHost.get(hostProduct) ?? new Map<string, string>();
  columns.set(hostColumn, embeddedProduct);
  columnsByHost.set(hostProduct, columns);
}

/**
 * The product a column of a host row refers to, or undefined for any other column. An embedding is an array column
 * under its declared name, or a single reference hydrated under that name from a `<name>Id` column.
 */
export function embeddedProductOf(hostProduct: string, field: string): string | undefined {
  const columns = columnsByHost.get(hostProduct);
  if (!columns) return undefined;
  return columns.get(field) ?? (field.endsWith('Id') ? columns.get(field.slice(0, -2)) : undefined);
}

/** Whether `field` is an embedding column of `hostProduct` as declared: the array the worker cleans. */
export function isEmbeddingColumn(hostProduct: string, field: string): boolean {
  return columnsByHost.get(hostProduct)?.has(field) ?? false;
}
