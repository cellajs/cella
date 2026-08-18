import { faker } from '@faker-js/faker';
import { MOCK_REF_DATE } from './mock-timestamps';

/** Relative to MOCK_REF_DATE: an unset refDate falls back to Date.now() and drifts on every run. */
export const mockPastIsoDate = () => faker.date.past({ refDate: MOCK_REF_DATE }).toISOString();
