import { faker } from '@faker-js/faker';
import { MOCK_REF_DATE } from './mock-timestamps';

/**
 * Past ISO date relative to MOCK_REF_DATE for determinism under withFakerSeed()
 * because an unset refDate would fall back to Date.now() and drift on every run.
 */
export const mockPastIsoDate = () => faker.date.past({ refDate: MOCK_REF_DATE }).toISOString();
