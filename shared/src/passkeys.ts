/**
 * The COSE algorithms a passkey may use, EdDSA, ES256 and RS256 (WebAuthn §5.4): the browser asks for these at
 * registration and the server accepts no other (§7.1 step 20).
 */
export const passkeyAlgorithms = [-8, -7, -257] as const;
