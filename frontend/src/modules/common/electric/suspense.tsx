import { useElectric } from './electrify';
import Spinner from '../spinner';

const ElectricSuspense = ({ children }: { children: React.ReactNode }) => {
  const Electric = useElectric();

  if (!Electric) return <Spinner />;

  return children;
};

export default ElectricSuspense;
