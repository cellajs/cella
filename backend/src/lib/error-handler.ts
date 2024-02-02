import { sendError, setCustomData, setNamespace } from '@appsignal/nodejs';
import { ErrorHandler } from 'hono';
import { Env } from '../types/common';
import { customLogger } from './custom-logger';

const errorHandler: ErrorHandler<Env> = (err, c) => {
  const user = c.get('user');
  const organization = c.get('organization');

  const data = {
    requestPath: c.req.path,
    requestMethod: c.req.method,
    userId: user?.id,
    organizationId: organization?.id,
    error: `${err}`,
    errorCode: 500,
  };

  customLogger('Error', data, 'error');

  sendError(err, () => {
    setCustomData(data);
    setNamespace('backend');
  });

  return c.json(
    {
      success: false,
      error: 'Something went wrong. Please try again later.',
    },
    500,
  );
};

export default errorHandler;
