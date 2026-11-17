import type { ProductEntityType } from '../types.ts';
import { appConfig } from './config-builder/app-config.ts';

const linkLetters: Partial<Record<ProductEntityType, string>> = appConfig.numberedProducts;

/** The product types numbered per home channel, in `productEntityTypes` order. */
export const numberedProductTypes = appConfig.productEntityTypes.filter((type) => type in linkLetters);

/** The letter a numbered product type's share links carry, `a` in `/{code}/a7`; undefined for a type without numbers. */
export const productLinkLetter = (type: ProductEntityType): string | undefined => linkLetters[type];
