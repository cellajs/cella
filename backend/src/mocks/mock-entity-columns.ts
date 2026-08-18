import { faker } from '@faker-js/faker';
import type { ChannelEntityType, EntityIdColumns, EntityType, ProductEntityType } from 'shared';
import { hierarchy } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
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

/** Mirrors `tenantEntityColumns`. Runs inside the caller's faker seed, so composing it needs no nested reset. */
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

/** Mirrors `productColumns`. Entity-specific and hierarchy-derived columns stay in the owning module. */
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
  toolsConfig: ToolsConfig;
  path: string | null;
};

type MockChannelColumnOptions = Partial<Omit<MockChannelColumns<ChannelEntityType>, 'entityType' | 'path'>> & {
  channelIds?: Partial<EntityIdColumns<ChannelEntityType, string>>;
};

/** Mirrors `channelColumns` including the generated path; `channelIds` only feeds the DB path rule. */
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
    toolsConfig: options.toolsConfig ?? {},
    path: hierarchy.computeChannelPath(entityType, { id: base.id, ...options.channelIds }),
  };
};
