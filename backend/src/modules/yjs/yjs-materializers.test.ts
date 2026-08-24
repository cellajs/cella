import '#/modules';

import { appConfig, type ProductEntityType } from 'shared';
import { describe, expect, it } from 'vitest';
import { defineBackendModule } from '#/lib/module';
import { getYjsMaterializer, type YjsMaterializer } from '#/modules/yjs/yjs-materializers';

/**
 * A collab session is persisted by dispatching to the entity's registered materializer, so an
 * unregistered product type fails the whole session at save time, not at edit time. This
 * guards the registration round-trip: the relay is entity-agnostic, the registry is not.
 */
describe('Yjs materializers', () => {
  // Apps may ship a materializer on any product type, so probe for one that has none.
  const unregisteredType = appConfig.productEntityTypes.find((type) => getYjsMaterializer(type) === undefined);

  it.skipIf(!unregisteredType)('returns undefined for a product type without a registered materializer', () => {
    expect(getYjsMaterializer(unregisteredType as ProductEntityType)).toBeUndefined();
  });

  it('resolves a materializer registered through defineBackendModule', () => {
    const productType = unregisteredType ?? appConfig.productEntityTypes[0];
    const materializer: YjsMaterializer = async () => undefined;
    defineBackendModule({
      name: 'yjs-materializer-test',
      owner: 'cella',
      description: 'Registration round-trip stub',
      scope: ['backend'],
      productEntity: productType,
      yjsMaterializer: materializer,
    });
    expect(getYjsMaterializer(productType)).toBe(materializer);
  });
});
