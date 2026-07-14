import { faker } from '@faker-js/faker';
import { MOCK_REF_DATE } from './mock-timestamps';

/**
 * Generates a random ISO date in the past, relative to MOCK_REF_DATE so
 * output is deterministic under withFakerSeed() (an unset refDate would
 * fall back to Date.now() and drift on every generation run).
 * @returns An ISO 8601 string representing a past date.
 */
export const mockPastIsoDate = () => faker.date.past({ refDate: MOCK_REF_DATE }).toISOString();
