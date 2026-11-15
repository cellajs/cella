import { appConfig } from 'shared';
import { redirectedApexOrigin } from 'shared/apex-origin';

const frontendOrigin = new URL(appConfig.frontendUrl).origin;
// The bare domain is shorter to paste; the load balancer sends it on to the app host with the path kept.
const linkOrigin = redirectedApexOrigin(new URL(frontendOrigin).hostname, appConfig.domain) ?? frontendOrigin;

/** The link that unfurls in chats and opens a channel, or the product numbered `number` in it, in the app; the path follows `shareLinkPath`. */
export const shareLink = (code: string, product?: { letter: string; number: number }) =>
  `${linkOrigin}/${code}${product ? `/${product.letter}${product.number}` : ''}`;
