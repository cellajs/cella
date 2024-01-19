import { Outlet } from '@tanstack/react-router';
import PageNav from '~/components/page-nav';
import { SimpleHeader } from '~/components/simple-header';

const systemTabs = [
  {
    name: 'Users',
    path: '/system',
  },
  {
    name: 'Organizations',
    path: '/system/organizations',
  },
];

const SystemPanel = () => {
  return (
    <>
      <SimpleHeader heading="System" text="System admins can manage and monitor all organizations and their members." />
      <PageNav tabs={systemTabs} />
      <div className="container mt-4 flex-[1_1_0]">
        <Outlet />
      </div>
    </>
  );
};

export default SystemPanel;
