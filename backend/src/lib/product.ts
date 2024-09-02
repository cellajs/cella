import { eq, inArray, or } from 'drizzle-orm';
import { db } from '#/db/db';
import { tasksTable } from '#/db/schema/tasks';

// Create a map to store tables for different product resource types
export const productTables = new Map<string, typeof tasksTable>([['task', tasksTable]]);

/**
 * Resolves product based on ID or Slug and sets the context accordingly.
 * @param productType - The type of the product.
 * @param idOrSlug - The unique identifier (ID or Slug) of the product.
 */
export const resolveProduct = async (productType: string, idOrSlug: string) => {
  const table = productTables.get(productType);

  // Return early if table is not available
  if (!table) throw new Error(`Invalid product: ${productType}`);

  const [product] = await db
    .select()
    .from(table)
    .where(or(eq(table.id, idOrSlug), eq(table.slug, idOrSlug)));

  return product;
};

/**
 * Resolves entities based on their IDs and sets the context accordingly.
 * @param productType - The type of the product.
 * @param ids - An array of unique identifiers (IDs) of the entities.
 */
export const resolveProducts = async (productType: string, ids: Array<string>) => {
  // Get the corresponding table for the product type
  const table = productTables.get(productType);

  // Return early if table is not available
  if (!table) throw new Error(`Invalid product: ${productType}`);

  // Validate presence of IDs
  if (!Array.isArray(ids) || !ids.length) throw new Error(`Missing or invalid query identifiers for product: ${productType}`);

  // Query for multiple entities by IDs
  const entities = await db.select().from(table).where(inArray(table.id, ids));

  return entities;
};
