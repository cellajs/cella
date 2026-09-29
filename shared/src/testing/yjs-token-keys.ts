import { yjsTokenPublicKey } from '../utils/yjs-token.ts';

/** Key material test runs sign Yjs tokens with: the backend reads it as YJS_TOKEN_PRIVATE_KEY, the relay only its public half. */
export const testYjsTokenKeyMaterial = 'test-yjs-token-key-material-min-32-chars';

/** The relay's YJS_TOKEN_PUBLIC_KEY in test runs. */
export const testYjsTokenPublicKey = yjsTokenPublicKey(testYjsTokenKeyMaterial);
