import { yjsTokenPublicKey } from 'shared/utils/yjs-token';
import { modeSecret } from '#/env';

/**
 * Prints the YJS_TOKEN_PUBLIC_KEY that matches this backend's YJS_TOKEN_PRIVATE_KEY, for the Yjs relay's env. The
 * relay holds only this public half, so it verifies editor tokens and never mints one. Deploys derive it themselves.
 *
 * Usage: pnpm --filter backend yjs:public-key
 */
console.info(`YJS_TOKEN_PUBLIC_KEY=${yjsTokenPublicKey(modeSecret('YJS_TOKEN_PRIVATE_KEY'))}`);
