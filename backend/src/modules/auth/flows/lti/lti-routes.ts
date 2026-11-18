import { createXRoutes, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { ltiRegisterQuerySchema } from '#/modules/auth/flows/lti/lti-schema';

export const authLtiRoutes = createXRoutes(['auth', 'cella'], {
  registerLtiPlatform: xRoute({
    method: 'get',
    path: '/lti/register',
    xEnabledBy: { strategy: 'lti' },
    xGuard: [publicGuard],
    summary: 'Register at an LTI platform',
    description:
      "The registration link an organization admin pastes into an LTI platform, which opens it in a frame (LTI Dynamic Registration). Spends the one-use link, reads the platform's OpenID configuration, registers the app as an LTI tool and stores the connection for the link's tenant. Any LTI platform may frame the page, which holds no session.",
    request: { query: ltiRegisterQuerySchema },
    responses: {
      200: { description: 'Registered\n\nA page with one line of text that sends the platform the close message.' },
      400: { description: 'Registration refused\n\nThe same page, naming why the platform or its configuration was refused.' },
      401: { description: 'Registration link refused\n\nThe same page: the link was used before, never existed or expired.' },
      409: { description: 'Already registered\n\nThe same page: the platform registered this client id before.' },
    },
  }),
});
