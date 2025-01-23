export const authKeys = {
  all: ['auth'] as const,
  verify: () => [...authKeys.all, 'auth'] as const,
  check: () => [...authKeys.all, 'auth'] as const,
  send: () => [...authKeys.all, 'send'] as const,
  verifyEmail: () => [...authKeys.verify(), 'email'] as const,
  checkEmail: () => [...authKeys.check(), 'email'] as const,
  requestResetPassword: () => [...authKeys.send(), 'resetPassword'] as const,
  resetPassword: () => [...authKeys.all, 'resetPassword'] as const,
  signIn: () => [...authKeys.all, 'signIn'] as const,
  signUp: () => [...authKeys.all, 'signUp'] as const,
};
