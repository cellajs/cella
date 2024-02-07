import { useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getUserBySlugOrId } from '~/api/users';
import { User } from '~/types';

import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { ContentHeader } from '~/modules/common/content-header';

const UserProfile = () => {
  const { userIdentifier }: { userIdentifier: string } = useParams({ strict: false });
  const [user, setUser] = useState<User | null>(null);
  const [apiWrapper] = useApiWrapper();

  useEffect(() => {
    apiWrapper(
      () => getUserBySlugOrId(userIdentifier),
      (result) => {
        setUser(result);
      },
    );
  }, [userIdentifier]);

  return (
    <>
      <ContentHeader heading="Profile" text="user profile page with banner" />

      <div className="container py-4">
        <div className="flex flex-wrap justify-center">
          <h1>User Profile</h1>
        </div>
        <code>{JSON.stringify(user, null, 2)}</code>
      </div>
    </>
  );
};

export default UserProfile;
