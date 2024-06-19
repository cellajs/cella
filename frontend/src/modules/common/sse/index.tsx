import { useNavigationStore } from '~/store/navigation';
import { useSSE } from './use-sse';
import { getUserMenu } from '~/api/me';

const SSE = () => {
  const updateEntity = async (e: MessageEvent<string>) => {
    try {
      console.log('e:', e);
      const menu = await getUserMenu();
      useNavigationStore.setState({ menu });
    } catch (error) {
      console.error('Error parsing main update event', error);
    }
  };

  const addEntity = async (e: MessageEvent<string>) => {
    try {
      console.log('e:', e);
      const menu = await getUserMenu();
      useNavigationStore.setState({ menu });
    } catch (error) {
      console.error('Error parsing main create new event', error);
    }
  };

  const removeEntity = async (e: MessageEvent<string>) => {
    try {
      console.log('e:', e);
      const menu = await getUserMenu();
      useNavigationStore.setState({ menu });
    } catch (error) {
      console.error('Error parsing main remove event', error);
    }
  };

  useSSE('create_entity', (e) => addEntity(e));
  useSSE('update_entity', (e) => updateEntity(e));
  useSSE('remove_entity', (e) => removeEntity(e));

  return null;
};

export default SSE;
