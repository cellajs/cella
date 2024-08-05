import { config } from 'config';
import { ElectricDatabase, electrify } from 'electric-sql/browser';
import { uniqueTabId } from 'electric-sql/util';
import { LIB_VERSION } from 'electric-sql/version';
import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import { ElectricProvider as BaseElectricProvider, type Electric, schema } from './electrify';

interface Props {
  children: React.ReactNode;
}

function deleteDB(dbName: string) {
  console.info('Deleting DB due to schema mismatch in relation to server');
  const DBDeleteRequest = window.indexedDB.deleteDatabase(dbName);
  DBDeleteRequest.onsuccess = () => {
    console.info('Database deleted successfully');
  };
  // the indexedDB cannot be deleted if the database connection is still open,
  // so we need to reload the page to close any open connections.
  // On reload, the database will be recreated.
  window.location.reload();
}

const ElectricProvider = ({ children }: Props) => {
  const user = useUserStore((state) => state.user);
  // TODO: Consider exposing projectIds other way so we can  prevent loading all. Only sync the tasks and labels of projects the user is a member of and it's not archived.
  const { menu } = useNavigationStore();

  const [electric, setElectric] = useState<Electric>();
  const [showAlert, setShowAlert] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const debug = config.debug;
    const { tabId } = uniqueTabId();
    const scopedDbName = `basic-${LIB_VERSION}-${tabId}.db`;

    const init = async () => {
      try {
        const conn = await ElectricDatabase.init(scopedDbName);
        const electric = await electrify(conn, schema, {
          debug: debug,
          url: config.electricUrl,
        });

        // Wait until the user is loaded
        if (!isMounted || !user || !user.electricJWTToken) return;

        // Connect to the server with the user's JWT token.
        await electric.connect(user.electricJWTToken);

        if (config.mode === 'development') {
          const { addToolbar } = await import('@electric-sql/debug-toolbar');
          addToolbar(electric);

          const toolbarNode = document.getElementById('__electric_debug_toolbar_container');
          if (toolbarNode) toolbarNode.classList.add('hidden');
        }

        setElectric(electric);
        setShowAlert(false);

        // Resolves when the shape subscription has been established.
        const projectIds = menu.workspaces
          .filter((w) => !w.membership.archived)
          .flatMap((w) => w.submenu?.filter((p) => !p.membership.archived).map((p) => p.id) || []);
        const tasksShape = await electric.db.tasks.sync({
          where: {
            project_id: {
              in: projectIds,
            },
          },
        });

        const labelsShape = await electric.db.labels.sync({
          where: {
            project_id: {
              in: projectIds,
            },
          },
        });

        // Resolves when the data has been synced into the local database.
        await tasksShape.synced;
        await labelsShape.synced;

        const timeToSync = performance.now();
        if (debug) console.log(`Synced in ${timeToSync}ms from page load`);
      } catch (error) {
        if ((error as Error).message.startsWith('Local database schema mismatches with server schema')) {
          deleteDB(scopedDbName);
        }
        throw error;
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [menu]);

  const closeAlert = () => {
    setShowAlert(false);
  };

  return (
    <>
      <BaseElectricProvider db={electric}>{children}</BaseElectricProvider>
      {showAlert && (
        <div className="fixed z-[300] max-sm:bottom-[4rem] bottom-0 border-0 p-4 flex w-full justify-center">
          <Alert variant="plain" className="border-0 w-auto">
            <Button variant="ghost" size="sm" className="absolute top-2 right-2" onClick={closeAlert}>
              <X size={14} />
            </Button>
            <AlertDescription className="pr-10 font-light flex items-center justify-center">
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
