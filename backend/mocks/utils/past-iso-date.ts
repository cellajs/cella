import { faker } from '@faker-js/faker';

/**
 * Generates a random ISO date in the past.
 * @returns An ISO 8601 string representing a past date.
 */
export const pastIsoDate = () => faker.date.past().toISOString();
