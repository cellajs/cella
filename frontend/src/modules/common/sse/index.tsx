import { queryClient } from '~/lib/router';
import { useSSE } from '~/modules/common/sse/use-sse';
import { organizationsKeys } from '~/modules/organizations/query';
import { menuKeys } from '~/modules/users/query';

const SSE = () => {
  const refetchMenu = () => {
    queryClient.invalidateQueries({ queryKey: menuKeys.all, refetchType: 'all' });
  };

  const newInvite = (e: MessageEvent<string>) => {
    try {
      const data = JSON.parse(e.data);
      const { id, slug } = data;

      queryClient.invalidateQueries({ queryKey: organizationsKeys.single(id) });
      queryClient.invalidateQueries({ queryKey: organizationsKeys.single(slug) });
    } catch (error) {
      console.error('Error parsing main new member event', error);
    }
  };

  useSSE('refetch_menu', refetchMenu);
  useSSE('new_member_invite', (e) => newInvite(e));

  return null;
};

export default SSE;
