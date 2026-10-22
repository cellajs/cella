import { faker } from '@faker-js/faker';
import { mockRefDate } from './mock-timestamps';

/** Relative to mockRefDate: an unset refDate falls back to Date.now() and drifts on every run. */
export const mockPastIsoDate = () => faker.date.past({ refDate: mockRefDate }).toISOString();
