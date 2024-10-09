import { ErrorBoundary } from 'react-error-boundary';
import { MainContent } from '~/modules/common/main-content';

import { Dialoger } from '~/modules/common/dialoger';
import { DropDowner } from '~/modules/common/dropdowner';
import ErrorNotice from '~/modules/common/error-notice';
import MainNav from '~/modules/common/main-nav';
import { SetBody } from '~/modules/common/set-body';
import { Sheeter } from '~/modules/common/sheeter';
import SSE from '~/modules/common/sse';
import { SSEProvider } from '~/modules/common/sse/provider';

const App = () => {
  return (
    <div id="main-app-root">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} isRootLevel resetErrorBoundary={resetErrorBoundary} />}
      >
        <SSEProvider>
          <MainNav />
          <SetBody />
          <SSE />
          <MainContent />
          <Dialoger />
          <Sheeter />
          <DropDowner />
        </SSEProvider>
      </ErrorBoundary>
    </div>
  );
};

export default App;
