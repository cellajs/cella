import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { createContext } from 'react';

import { UserProfileRoute, userQueryOptions } from '~/router/routeTree';
import { User } from '~/types';

import { PageHeader } from '~/modules/common/page-header';

interface UserContextValue {
  user: User;
}

export const UserContext = createContext({} as UserContextValue);

const UserProfile = () => {
  const { userIdentifier } = useParams({ from: UserProfileRoute.id });
  const userQuery = useSuspenseQuery(userQueryOptions(userIdentifier));
  const user = userQuery.data;

  return (
    <UserContext.Provider value={{ user }}>
      <PageHeader id={user.id} title={user.name} type="user" thumbnailUrl={user.thumbnailUrl} bannerUrl={user.bannerUrl} />
      <div className="container min-h-screen mt-4">
        <code>{JSON.stringify(user, null, 2)}</code>
      </div>
    </UserContext.Provider>
  );
};

export default UserProfile;
