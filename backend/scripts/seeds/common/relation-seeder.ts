/**
 * Abstract base class for seeding relation entities between two or more domain entities.
 * Provides basic batch creation logic.
 */
export abstract class RelationSeeder<T> {
  /**
   * Creates a single relation record.
   * Must be implemented by subclasses.
   */
  abstract make(...args: any[]): T;

  /**
   * Creates multiple relation records.
   * @param items - Array of items to relate (e.g., users).
   * @param relation - The related entity (e.g., organization).
   * @returns Array of relation records.
   */
  makeMany(items: any[], relation: any): T[] {
    return items.map(item => this.make(item, relation));
  }
}