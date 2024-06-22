import { config } from 'config';
import { ElectricDatabase, electrify } from 'electric-sql/browser';
import { uniqueTabId } from 'electric-sql/util';
import { LIB_VERSION } from 'electric-sql/version';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '~/modules/ui/alert';
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
  // TODO: Temporary fix to prevent loading all projects and labels. Only sync the projects and labels of organizations the user is a member of.
  // TODO: Consider exposing organizationIds the user is part of on the user object, as the menu can be undefined.
  const { menu } = useNavigationStore();

  const [electric, setElectric] = useState<Electric>();

  // TODO: can we move this out of a useEffect?
  useEffect(() => {
    let isMounted = true;

    const debug = config.mode === 'development';
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
        if (!isMounted || !user || !user.electricJWTToken) {
          return;
        }

        // Connect to the server with the user's JWT token.
        await electric.connect(user.electricJWTToken);

        if (debug) {
          const { addToolbar } = await import('@electric-sql/debug-toolbar');
          addToolbar(electric);

          const toolbarNode = document.getElementById('__electric_debug_toolbar_container');
          if (toolbarNode) toolbarNode.classList.add('hidden');
        }

        setElectric(electric);

        // Resolves when the shape subscription has been established.
        // TODO: Improve the following section by deriving organization IDs differently.
        // TODO: Update organizationIds to sync whenever the user's menu changes.
        const organizationIds = menu.organizations.map((item) => item.id);
        const tasksShape = await electric.db.tasks.sync({
          where: {
            organization_id: {
              in: organizationIds,
            },
          },
        });

        const labelsShape = await electric.db.labels.sync({
          where: {
            organization_id: {
              in: organizationIds,
            },
          },
        });

        // Resolves when the data has been synced into the local database.
        await tasksShape.synced;
        await labelsShape.synced;

        const timeToSync = performance.now();
        if (debug) {
          console.log(`Synced in ${timeToSync}ms from page load`);
        }
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
  }, [user]);

  return (
    <>
      <BaseElectricProvider db={electric}>{children}</BaseElectricProvider>
      {electric === undefined && (
        <div className="fixed z-[300] max-xs:bottom-[64px]  bottom-0 border-0 p-4 flex w-full justify-center">
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
