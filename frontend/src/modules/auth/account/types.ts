import type { MeAuthData } from 'sdk';

export type Session = MeAuthData['sessions'][number];
export type Passkey = MeAuthData['passkeys'][number];
