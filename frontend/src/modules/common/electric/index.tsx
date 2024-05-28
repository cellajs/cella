import { config } from 'config';
import { ElectricDatabase, electrify } from 'electric-sql/browser';
import { uniqueTabId } from 'electric-sql/util';
import { LIB_VERSION } from 'electric-sql/version';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { useUserStore } from '~/store/user';
import type { User } from '~/types';
import { ElectricProvider as BaseElectricProvider, type Electric, schema } from './electrify';

interface Props {
  children: React.ReactNode;
}

function deleteDB(dbName: string) {
  console.log("Deleting DB as schema doesn't match server's");
  const DBDeleteRequest = window.indexedDB.deleteDatabase(dbName);
  DBDeleteRequest.onsuccess = () => {
    console.log('Database deleted successfully');
  };
  // the indexedDB cannot be deleted if the database connection is still open,
  // so we need to reload the page to close any open connections.
  // On reload, the database will be recreated.
  window.location.reload();
}

const ElectricProvider = ({ children }: Props) => {
  const user = useUserStore((state) => state.user) as User | null;
  const [electric, setElectric] = useState<Electric>();

  useEffect(() => {
    let isMounted = true;

    const { tabId } = uniqueTabId();
    const scopedDbName = `basic-${LIB_VERSION}-${tabId}.db`;

    const init = async () => {
      try {
        const conn = await ElectricDatabase.init(scopedDbName);
        const electric = await electrify(conn, schema, {
          debug: config.debug,
          url: config.electricUrl,
        });

        await electric.connect(user?.electricJWTToken || '0');

        if (!isMounted) {
          return;
        }

        setElectric(electric);

        // Resolves when the shape subscription has been established.
        const tasksShape = await electric.db.tasks.sync();
        const labelsShape = await electric.db.labels.sync();

        // Resolves when the data has been synced into the local database.
        await tasksShape.synced;
        await labelsShape.synced;

        const timeToSync = performance.now();
        if (config.debug) {
          console.log(`Synced in ${timeToSync}ms from page load`);
        }
      } catch (error) {
        if ((error as Error).message.startsWith("Local schema doesn't match server's")) {
          deleteDB(scopedDbName);
        }
        throw error;
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <BaseElectricProvider db={electric}>{children}</BaseElectricProvider>
      {electric === undefined && (
        <div className="fixed z-[300] bottom-0 border-0 p-4 flex w-full justify-center">
          <Alert variant="plain" className="border-0 w-auto">
            <AlertDescription className="pr-8 font-light flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="ml-2">Initializing local database</span>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </>
  );
};

export default ElectricProvider;
