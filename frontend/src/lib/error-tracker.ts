import * as ErrorTracker from '@sentry/react';
import { appConfig } from 'config';
import { ApiError } from '~/lib/api';

// Initialize error tracker
window.ononline = () => {
  initErrorTracker();
};

// Close error tracker when offline to avoid sending errors
window.onoffline = () => {
  console.info('You went offline. Closing error tracker.');
  ErrorTracker.close();
};

export const initErrorTracker = () => {
  // Send errors to error tracker
  ErrorTracker.init({
    enabled: !!appConfig.errorTrackerDsn,
    dsn: appConfig.errorTrackerDsn,
    beforeSend: (event, hint) => {
      const error = hint?.originalException;

      if (error) {
        if (error instanceof ApiError) {
          // Handle ApiError first, because it likely extends Error
          event.fingerprint = [error.name, error.message, error.status.toString()];
        } else if (error instanceof Error) {
          // Generic Error
          event.fingerprint = [error.name, error.message];
        } else {
          // Fallback for non-Error exceptions (strings, objects, etc.)
          event.fingerprint = [String(error)];
        }
      }

      return event;
    },
    environment: appConfig.mode,
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    tracesSampleRate: 1.0,
    // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
    tracePropagationTargets: ['localhost', appConfig.backendUrl, appConfig.frontendUrl],
    // Capture Replay for 10% of all sessions, plus for 100% of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
};
