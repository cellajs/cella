import { Outlet, ScrollRestoration } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy, useEffect, useState } from 'react';

import { Dialoger } from '~/modules/common/dialoger';
import ReloadPrompt from '~/modules/common/reload-prompt';
import { Sheeter } from '~/modules/common/sheeter';
import { Toaster } from '~/modules/ui/sonner';
import { TooltipProvider } from '~/modules/ui/tooltip';
import { DownAlert } from '../down-alert';

import { uniqueTabId } from 'electric-sql/util';
import { LIB_VERSION } from 'electric-sql/version';
import { ElectricDatabase, electrify } from 'electric-sql/wa-sqlite';
import * as jose from 'jose';
import { useUserStore } from '~/store/user';
import { ElectricProvider, schema, type Electric } from './electric';

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

// Lazy load Tanstack dev tools in development
const TanStackRouterDevtools =
  config.mode === 'production'
    ? () => null
    : lazy(() =>
        import('@tanstack/router-devtools').then((res) => ({
          default: res.TanStackRouterDevtools,
        })),
      );

// Lazy load gleap chat support
const GleapSupport = config.gleapToken ? lazy(() => import('~/modules/common/gleap')) : () => null;

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

function Root() {
  const user = useUserStore((state) => state.user);
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
          url: 'http://localhost:5133',
        });

        const token = await unsignedJWT(user.id);
        await electric.connect(token);

        if (!isMounted) {
          return;
        }

        setElectric(electric);

        // Resolves when the shape subscription has been established.
        const shape = await electric.db.projects.sync({
          include: {
            tasks: true,
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
    throw new Error('Electric is not ready yet');
  }

  return (
    <ElectricProvider db={electric}>
      <TooltipProvider disableHoverableContent delayDuration={300} skipDelayDuration={0}>
        <ScrollRestoration />
        <Outlet />
        <Toaster richColors />
        <Dialoger />
        <Sheeter />
        <ReloadPrompt />
        <Suspense fallback={null}>
          <TanStackRouterDevtools />
        </Suspense>
        <DownAlert />

        <Suspense fallback={null}>
          <GleapSupport />
        </Suspense>
      </TooltipProvider>
    </ElectricProvider>
  );
}

export { Root };
