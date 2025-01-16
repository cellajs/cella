import type { ReactNode } from 'react';

export const TableHeaderContainer = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center max-sm:justify-between md:gap-2 mt-4">{children}</div>
);
