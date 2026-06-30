import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'auth',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Authentication endpoints supporting multiple sign-in methods, including OAuth
    (Google, Microsoft, GitHub), and passkeys (WebAuthn). These routes cover user sign-up, sign-in,
    email verification, account linking, and impersonation for system admins.`,
});
