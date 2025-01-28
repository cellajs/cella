import { hash, verify } from '@node-rs/argon2';
import { env } from '../../../../env';

// Hash password (with a secret) using argon2id
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id
export const hashPassword = async (password: string) => {
  return await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
    secret: Buffer.from(env.ARGON_SECRET, 'utf-8'),
  });
};

export const verifyPasswordHash = async (hash: string, password: string) => {
  return await verify(hash, password, {
    secret: Buffer.from(env.ARGON_SECRET, 'utf-8'),
  });
};
