// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api';
import { ApiErrorDescription } from '~/modules/common/toaster/api-error-description';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;
const writeText = vi.fn(() => Promise.resolve());

const failure = new ApiError({
  status: 500,
  type: 'server_error',
  severity: 'error',
  requestId: 'req-1',
  method: 'POST',
  path: '/organizations',
  timestamp: '2026-10-07T12:00:00.000Z',
});

describe('ApiErrorDescription', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('shows what happened, then the cause, then the request id', async () => {
    await act(async () => root?.render(<ApiErrorDescription message="Not completed." cause="TypeError: boom" report={failure} />));

    expect([...container.querySelectorAll('p')].map((line) => line.textContent)).toEqual([
      'Not completed.',
      'TypeError: boom',
      'c:request_id: req-1',
    ]);
  });

  it('shows no request id line for an error that is not worth reporting', async () => {
    await act(async () => root?.render(<ApiErrorDescription message="Not completed." />));

    expect(container.textContent).toBe('Not completed.');
    expect(container.querySelector('button')).toBeNull();
  });

  it('copies what support asks for, leaving out what the error does not carry', async () => {
    await act(async () => root?.render(<ApiErrorDescription report={failure} />));
    await act(async () => container.querySelector('button')?.click());

    expect(writeText).toHaveBeenCalledWith(
      [
        'c:request_id: req-1',
        'c:type: server_error',
        'c:http_status: 500',
        'c:request: POST /organizations',
        'c:timestamp: 2026-10-07T12:00:00.000Z',
      ].join('\n'),
    );
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('c:copied');

    writeText.mockClear();
    const bare = new ApiError({ status: 500, severity: 'error', requestId: 'req-2' });
    await act(async () => root?.render(<ApiErrorDescription report={bare} />));
    await act(async () => container.querySelector('button')?.click());

    expect(writeText).toHaveBeenCalledWith('c:request_id: req-2\nc:http_status: 500');
  });
});
