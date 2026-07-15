import { faker } from '@faker-js/faker';

/** Standard reference date for deterministic date generation in mocks */
export const MOCK_REF_DATE = new Date('2025-01-01T00:00:00.000Z');

/**
 * created/modified timestamps: createdAt in the past, updatedAt between createdAt
 * and refDate. Must run inside withFakerSeed() for deterministic output.
 */
export const mockTimestamps = (refDate = MOCK_REF_DATE) => {
  const createdAt = faker.date.past({ refDate });
  return {
    createdAt: createdAt.toISOString(),
    updatedAt: faker.date.between({ from: createdAt, to: refDate }).toISOString(),
  };
};
