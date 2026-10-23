import { faker } from '@faker-js/faker';

/** Standard reference date for deterministic date generation in mocks */
export const mockRefDate = new Date('2025-01-01T00:00:00.000Z');

/** createdAt in the past, updatedAt between createdAt and refDate. Must run inside withFakerSeed(). */
export const mockTimestamps = (refDate = mockRefDate) => {
  const createdAt = faker.date.past({ refDate });
  return { createdAt: createdAt.toISOString(), updatedAt: faker.date.between({ from: createdAt, to: refDate }).toISOString() };
};
