import { Loader2 } from 'lucide-react';
import { useElectric } from './electrify';

const ElectricSuspense = ({ children }: { children: React.ReactNode }) => {
  const Electric = useElectric();

  if (!Electric) return <Loader2 className="text-muted-foreground mx-auto mt-[40vh] h-10 w-10 animate-spin" />;

  return children;
};

export default ElectricSuspense;
