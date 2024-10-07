import { Outlet } from '@tanstack/react-router';

import AlertRenderer from '~/modules/common/main-alert/alert-render';

export const MainContent = () => {
  return (
    <div
      id="main-app-content"
      className="transition-spacing duration-500 ease-in-out sm:min-h-[100vh] max-sm:min-h-[calc(100vh-4rem)] sm:ml-16 group-[.focus-view]/body:ml-0 group-[.nav-open.keep-nav-open]/body:xl:pl-80 transition-all duration-300 ease-in-out"
    >
      <main id="main-block-app-content" className="flex-1 flex flex-col" aria-label="Main Content">
        <AlertRenderer />
        <Outlet />
      </main>
    </div>
  );
};
