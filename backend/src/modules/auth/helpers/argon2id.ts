import { Argon2id } from 'oslo/password';
import { env } from '../../../../env';

// Converter func cos Argon2id except secret as ArrayBuffer | TypedArray
const getArgonSecret = () => {
  return new TextEncoder().encode(env.ARGON_SECRET);
};

export const hashPasswordWithArgon = async (password: string) => {
  const secret = getArgonSecret();
  const argon2id = new Argon2id({ secret });
  return await argon2id.hash(password);
};

export const verifyPasswordWithArgon = async (hashedPassword: string, password: string) => {
  const secret = getArgonSecret();
  const argon2id = new Argon2id({ secret });
  return await argon2id.verify(hashedPassword, password);
};
