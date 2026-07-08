import { createMockPinoModule } from 'shared/testing/pino';
import { vi } from 'vitest';

vi.doMock('../lib/pino', () => createMockPinoModule(() => vi.fn()));
