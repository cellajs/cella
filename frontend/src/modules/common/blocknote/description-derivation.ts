import type { ProductEntityType } from 'shared';

/** Columns an entity's update operation stores from its description, as a pure, synchronous function of it. */
type DescriptionDerivation = (description: string) => Record<string, unknown>;

const derivations = new Map<ProductEntityType, DescriptionDerivation>();

/** Register at module load (the entity's query.ts) with the derivation its update operation runs, so a collaborative patch carries what the relay's write will store. */
export function registerDescriptionDerivation(entityType: ProductEntityType, derive: DescriptionDerivation): void {
  derivations.set(entityType, derive);
}

/** The registered derivation's fields for a description; none for an unregistered type or a derivation that throws, so a commit never fails on one. */
export function deriveDescriptionFields(entityType: ProductEntityType, description: string): Record<string, unknown> {
  const derive = derivations.get(entityType);
  if (!derive) return {};
  try {
    return derive(description);
  } catch (error) {
    console.error('[description derivation]', entityType, error);
    return {};
  }
}
