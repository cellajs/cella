import '~/query/tests/query-client-env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The hook returns its options, so each lifecycle callback runs without rendering.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: (options: unknown) => options,
}));
vi.mock('~/env', () => ({ isDebugMode: false }));

const { userStore } = await import('~/modules/user/user-store');
const { useUpdateSelfFlagsMutation } = await import('~/modules/me/query');

type FlagsOptions = { onMutate: (variables: { userFlags?: { finishedOnboarding?: boolean } }) => unknown };

/** The mocked useMutation hands back its options, which the hook's return type does not describe. */
const options = () => useUpdateSelfFlagsMutation() as unknown as FlagsOptions;

const storedFlags = () => userStore.getState().user?.userFlags;

describe('useUpdateSelfFlagsMutation', () => {
  beforeEach(() => {
    userStore.setState({ user: { id: 'user-1', email: 'user-1@example.test', userFlags: { finishedOnboarding: false } } as never });
  });

  it('sets the flag in the store before the server answers, where the home route guard reads it', () => {
    options().onMutate({ userFlags: { finishedOnboarding: true } });

    expect(storedFlags()).toEqual({ finishedOnboarding: true });
  });
});
