import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'auth',
  kind: 'module',
  parent: 'cella',
  description: `*Authentication* endpoints supporting multiple sign-in methods, including OAuth
    (Google, Microsoft, GitHub), and passkeys (WebAuthn). These routes cover user sign-up, sign-in,
    email verification, account linking, and impersonation for system admins.`,
});
