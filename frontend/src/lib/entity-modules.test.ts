import { describe, expect, it } from 'vitest';
import { getProductDeepLink } from '~/lib/entity-modules';
import { defineFrontendModule } from '~/lib/module';

describe('entity module declarations', () => {
  // Cella has one product type, so here it stands in as its own host; what this pins is that the
  // host's param is looked up in the registry, not copied onto the hosted product.
  it("reads a product's deep-link param back, and its host's", () => {
    defineFrontendModule({
      name: 'attachments',
      owner: 'cella',
      scope: ['frontend'],
      description: 'test',
      product: { entityType: 'attachment', deepLinkParam: 'attachmentDialogId', deepLinkHost: 'attachment' },
    });

    expect(getProductDeepLink('attachment')).toEqual({ param: 'attachmentDialogId', hostParam: 'attachmentDialogId' });
  });
});
