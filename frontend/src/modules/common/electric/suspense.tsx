import { useElectric } from './electrify';
import { Loader2 } from 'lucide-react';

const ElectricSuspense = ({ children }: { children: React.ReactNode }) => {
  const Electric = useElectric();

  if (!Electric) return <Loader2 className="text-muted-foreground mx-auto mt-[40vh] h-10 w-10 animate-spin" />;

  return children;
};

export default ElectricSuspense;