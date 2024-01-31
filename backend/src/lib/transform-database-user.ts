import { UserModel } from '../db/schema';
import { ApiUser } from '../schemas/user';
import { getImadoUrl } from './imado-url';

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export const transformDatabaseUser = ({ hashedPassword, thumbnailUrl, ...apiUser }: PartialBy<UserModel, 'hashedPassword'>): ApiUser => {
  return {
    ...apiUser,
    thumbnailUrl: getImadoUrl.generate(thumbnailUrl, { width: 100, format: 'avif' }),
    clearSessionsAt: apiUser.clearSessionsAt?.toISOString() ?? null,
    lastEmailAt: apiUser.lastEmailAt?.toISOString() ?? null,
    lastSeenAt: apiUser.lastSeenAt?.toISOString() ?? null,
    lastVisitAt: apiUser.lastVisitAt?.toISOString() ?? null,
    lastSignInAt: apiUser.lastSignInAt?.toISOString() ?? null,
    createdAt: apiUser.createdAt.toISOString(),
    modifiedAt: apiUser.modifiedAt?.toISOString() ?? null,
  };
};
