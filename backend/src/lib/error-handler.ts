import { sendError, setCustomData, setNamespace } from '@appsignal/nodejs';
import { ErrorHandler } from 'hono';
import { customLogger } from '../routes/middlewares/custom-logger';

const errorHandler: ErrorHandler = (err, c) => {
  customLogger('Error', { errorMessage: `${err}` }, 'error');

  sendError(err, () => {
    setCustomData({
      requestPath: c.req.path,
      requestMethod: c.req.method,
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
