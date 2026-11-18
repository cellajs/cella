import { appConfig, type ProductEntityType } from 'shared';
import { redirectedApexOrigin } from 'shared/apex-origin';
import { productLinkLetter } from 'shared/numbered-products';

const frontendOrigin = new URL(appConfig.frontendUrl).origin;
// The bare domain is shorter to paste; the load balancer sends it on to the app host with the path kept.
const linkOrigin = redirectedApexOrigin(new URL(frontendOrigin).hostname, appConfig.domain) ?? frontendOrigin;

/** The link that unfurls in chats and opens a channel, or its product numbered `number`; null for an unnumbered type. */
export function shareLink(code: string): string;
export function shareLink(code: string, product: { type: ProductEntityType; number: number }): string | null;
export function shareLink(code: string, product?: { type: ProductEntityType; number: number }) {
  if (!product) return `${linkOrigin}/${code}`;
  const letter = productLinkLetter(product.type);
  return letter ? `${linkOrigin}/${code}/${letter}${product.number}` : null;
}
