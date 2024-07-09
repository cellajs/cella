import Spinner from '../spinner';
import { useElectric } from './electrify';

const ElectricSuspense = ({ children }: { children: React.ReactNode }) => {
  const Electric = useElectric();

  if (!Electric) return <Spinner />;

  return children;
};

export default ElectricSuspense;
