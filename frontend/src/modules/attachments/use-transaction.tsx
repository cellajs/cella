import type { TransactionConfig } from '@tanstack/react-db';
import { createTransaction } from '@tanstack/react-db';
import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';

export const useTransaction = <T extends object = Record<string, unknown>>(options: TransactionConfig<T>) => {
  const transaction = createTransaction<T>({
    ...options,
    autoCommit: false, // always false to support offline buffering
  });

  // Auto-commit when online and pending
  useEffect(() => {
    if (!onlineManager.isOnline()) return;
    if (transaction.state !== 'pending' || !transaction.mutations.length) return;

    transaction.commit();
  }, [transaction.mutations, transaction.state]);

  return transaction;
};
