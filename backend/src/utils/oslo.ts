import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';

export const encodeLowerCased = (data: string) => encodeHexLowerCase(sha256(new TextEncoder().encode(data)));
