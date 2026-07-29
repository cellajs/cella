import { faker } from '@faker-js/faker';
import type { ChannelEntityType, EntityIdColumns, EntityType, ProductEntityType } from 'shared';
import { hierarchy } from 'shared';
import slugify from 'slugify';
import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { mockTenantId, mockUuid } from './mock-nanoid';
import { mockPastIsoDate } from './mock-past-iso-date';
import { mockStx } from './mock-stx';

type TenantEntityType = Exclude<EntityType, 'user'>;

type MockTenantEntityColumns<T extends TenantEntityType> = {
  createdAt: string;
  id: string;
  entityType: T;
  tenantId: string;
  name: string;
  updatedAt: string | null;
};

type MockTenantEntityColumnOptions = Partial<Omit<MockTenantEntityColumns<TenantEntityType>, 'entityType'>>;

/**
 * Stored fields mirroring `tenantEntityColumns`. Runs inside the caller's faker seed so modules can
 * compose it with entity-specific fields without nested seed resets.
 */
export const mockTenantEntityColumns = <T extends TenantEntityType>(
  entityType: T,
  options: MockTenantEntityColumnOptions = {},
): MockTenantEntityColumns<T> => {
  const createdAt = options.createdAt ?? mockPastIsoDate();
  return {
    createdAt,
    id: options.id ?? mockUuid(),
    entityType,
    tenantId: options.tenantId ?? mockTenantId(),
    name: options.name ?? faker.lorem.words(3),
    updatedAt: options.updatedAt === undefined ? createdAt : options.updatedAt,
  };
};

type MockProductColumns<T extends ProductEntityType> = MockTenantEntityColumns<T> & {
  stx: StxBase;
  description: string | null;
  keywords: string;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  publicAt: string | null;
  seq: number;
};

type MockProductColumnOptions = Partial<Omit<MockProductColumns<ProductEntityType>, 'entityType'>>;

/**
 * Stored fields mirroring `productColumns`. Entity-specific columns and hierarchy-derived relation
 * IDs stay in the owning module, matching the separate DB spreads.
 */
export const mockProductColumns = <T extends ProductEntityType>(
  entityType: T,
  options: MockProductColumnOptions = {},
): MockProductColumns<T> => {
  const createdBy = options.createdBy === undefined ? mockUuid() : options.createdBy;
  return {
    ...mockTenantEntityColumns(entityType, options),
    stx: options.stx ?? mockStx(),
    description: options.description === undefined ? faker.lorem.paragraph() : options.description,
    keywords: options.keywords ?? faker.lorem.words(3),
    createdBy,
    updatedBy: options.updatedBy === undefined ? createdBy : options.updatedBy,
    deletedAt: options.deletedAt ?? null,
    deletedBy: options.deletedBy ?? null,
    publicAt: options.publicAt ?? null,
    seq: options.seq ?? faker.number.int({ min: 1, max: 500 }),
  };
};

type MockChannelColumns<T extends ChannelEntityType> = MockTenantEntityColumns<T> & {
  slug: string;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  publishedAt: string | null;
  publicAt: string | null;
  path: string | null;
};

type MockChannelColumnOptions = Partial<Omit<MockChannelColumns<ChannelEntityType>, 'entityType' | 'path'>> & {
  channelIds?: Partial<EntityIdColumns<ChannelEntityType, string>>;
};

/**
 * Stored fields mirroring `channelColumns`, including the generated path value for full-row mocks.
 * Ancestor ID columns remain module-owned; `channelIds` is used only to mirror the DB path rule.
 */
export const mockChannelColumns = <T extends ChannelEntityType>(
  entityType: T,
  options: MockChannelColumnOptions = {},
): MockChannelColumns<T> => {
  const base = mockTenantEntityColumns(entityType, options);
  return {
    ...base,
    slug: options.slug ?? slugify(base.name, { lower: true, strict: true }),
    thumbnailUrl: options.thumbnailUrl ?? null,
    bannerUrl: options.bannerUrl ?? null,
    createdBy: options.createdBy ?? null,
    updatedBy: options.updatedBy ?? null,
    publishedAt: options.publishedAt === undefined ? base.createdAt : options.publishedAt,
    publicAt: options.publicAt ?? null,
    path: hierarchy.computeChannelPath(entityType, { id: base.id, ...options.channelIds }),
  };
};
