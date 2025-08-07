import type { TransactionConfig } from '@tanstack/react-db';
import { createTransaction } from '@tanstack/react-db';

export const useTransaction = <T extends object = Record<string, unknown>>(options: TransactionConfig<T>) => {
  const transaction = createTransaction<T>({
    ...options,
    autoCommit: true, // always false to support offline buffering
  });

  // Auto-commit when online and pending
  // useEffect(() => {
  //   if (transaction.state !== 'pending') return;

  //   transaction.commit();
  // }, [transaction.mutations, transaction.state]);

  return transaction;
};
