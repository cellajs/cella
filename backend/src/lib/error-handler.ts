import { sendError, setCustomData, setNamespace } from '@appsignal/nodejs';
import { ErrorHandler } from 'hono';
import { customLogger } from '../modules/middlewares/custom-logger';
import { Env } from '../types/common';

const errorHandler: ErrorHandler<Env> = (err, c) => {
  const user = c.get('user');
  const organization = c.get('organization');

  customLogger(
    'Error',
    {
      userId: user?.id,
      organizationId: organization?.id,
      error: `${err}`,
      errorCode: 500,
    },
    'error',
  );

  sendError(err, () => {
    setCustomData({
      requestPath: c.req.path,
      requestMethod: c.req.method,
      userId: user?.id,
      organizationId: organization?.id,
      error: `${err}`,
      errorCode: 500,
    });
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
