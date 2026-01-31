import { faker } from '@faker-js/faker';

/** Standard reference date for deterministic date generation in mocks */
export const MOCK_REF_DATE = new Date('2025-01-01T00:00:00.000Z');

/**
 * Generates deterministic created/modified timestamps.
 * createdAt is in the past, modifiedAt is between createdAt and refDate.
 * Must be called within withFakerSeed() for deterministic output.
 */
export const mockTimestamps = (refDate = MOCK_REF_DATE) => {
  const createdAt = faker.date.past({ refDate });
  return {
    createdAt: createdAt.toISOString(),
    modifiedAt: faker.date.between({ from: createdAt, to: refDate }).toISOString(),
  };
};

/**
 * Generates a single deterministic past date as ISO string.
 * Must be called within withFakerSeed() for deterministic output.
 */
export const mockPastDate = (refDate = MOCK_REF_DATE) => faker.date.past({ refDate }).toISOString();

/**
 * Generates a deterministic future date as ISO string.
 * Must be called within withFakerSeed() for deterministic output.
 */
export const mockFutureDate = (refDate = MOCK_REF_DATE, days = 30) => faker.date.soon({ days, refDate }).toISOString();
