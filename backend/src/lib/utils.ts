import { sign } from 'hono/jwt';
import { env } from '../../env';

interface GenerateTokenOptions {
  userId: string;
}

/**
 * Generates a JWT token for Electric. Expires in 1 day.
 *
 * @param {string} userId - The user ID to include in the token.
 * @returns {Promise<string>} - A promise that resolves to the generated JWT token.
 */
export const generateElectricJWTToken = async ({ userId }: GenerateTokenOptions): Promise<string> => {
  return await sign(
    {
      iat: Math.floor(Date.now() / 1000),
      iss: 'cella_backend',
      aud: 'cella_client',
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // Token expires in 1 day
      sub: userId,
    },
    env.ELECTRIC_PRIVATE_KEY_ES256,
    'ES256',
  );
};
