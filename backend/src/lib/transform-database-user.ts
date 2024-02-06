import { UserModel } from '../db/schema';
import { getImadoUrl } from './imado-url';

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export const transformDatabaseUser = ({ hashedPassword, thumbnailUrl, ...user }: PartialBy<UserModel, 'hashedPassword'>) => {
  return {
    ...user,
    thumbnailUrl: getImadoUrl.generate(thumbnailUrl, { width: 100, format: 'avif' }),
    clearSessionsAt: user.clearSessionsAt?.toISOString() ?? null,
    lastEmailAt: user.lastEmailAt?.toISOString() ?? null,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    lastVisitAt: user.lastVisitAt?.toISOString() ?? null,
    lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    modifiedAt: user.modifiedAt?.toISOString() ?? null,
  };
};
