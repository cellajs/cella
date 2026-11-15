import { registerHeldLink } from '#/modules/auth/core/tokens/operations/open-link-token';
import { oauthVerificationUrl } from '#/modules/auth/flows/oauth/operations/handle-oauth-verification';

// A verification link is held for its confirm page; once redeemed, the browser goes on to the provider. Registered when
// the OAuth handlers load.
registerHeldLink('oauth-verification', oauthVerificationUrl);
