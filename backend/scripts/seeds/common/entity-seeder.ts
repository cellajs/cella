/**
 * Abstract base class for creating data seeders for entities.
 * @template T The type of record the seeder produces.
 */
export abstract class EntitySeeder<T> {

  /**
   * Creates a single instance of type `T`.
   * This method must be implemented by subclasses.
   * @returns A new record of type `T`.
   */
  abstract make(): T;

  /**
   * Creates multiple instances of type `T`.
   * @param count - The number of records to generate.
   * @returns An array containing `count` records of type `T`.
   */
  makeMany(count: number): T[] {
    const results: T[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.make());
    }
    return results;
  }
}