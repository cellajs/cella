import { config } from 'config';
import { ElectricDatabase, electrify } from 'electric-sql/browser';
import { uniqueTabId } from 'electric-sql/util';
import { LIB_VERSION } from 'electric-sql/version';
import * as jose from 'jose';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { useUserStore } from '~/store/user';
import type { User } from '~/types';
import { ElectricProvider as BaseElectricProvider, type Electric, schema } from './electrify';

interface Props {
  children: React.ReactNode;
}

async function unsignedJWT(userId: string, customClaims?: object) {
  const textEncoder = new TextEncoder();
  const jwt = await new jose.SignJWT({ sub: userId, ...customClaims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('urn:example:issuer')
    .setAudience('urn:example:audience')
    .setExpirationTime('2h')
    .sign(textEncoder.encode('secret'));

  return jwt;
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

        const token = await unsignedJWT(user?.id || '0');
        await electric.connect(token);

        if (!isMounted) {
          return;
        }

        setElectric(electric);

        // Resolves when the shape subscription has been established.
        const shape = await electric.db.tasks.sync({
          include: {
            task_labels: true,
            task_users: true,
          },
        });

        // Resolves when the data has been synced into the local database.
        await shape.synced;

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

  if (electric === undefined) {
    return (
      <>
        {children}
        <div className="fixed z-[300] bottom-0 border-0 p-4 flex w-full justify-center">
          <Alert variant="plain" className="border-0 w-auto">
            <AlertDescription className="pr-8 font-light flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="ml-2">Initializing local database</span>
            </AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  return <BaseElectricProvider db={electric}>{children}</BaseElectricProvider>;
};

export default ElectricProvider;
