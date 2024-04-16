import { OpenAPIHono } from '@hono/zod-openapi';
import type { User } from 'lucia';
import type { z } from 'zod';

import type { Schema } from 'hono';
import type { OrganizationModel } from '../db/schema/organizations';
import type { errorResponseSchema } from '../lib/common-schemas';

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export type Env = {
  Variables: {
    user: User;
    organization: OrganizationModel;
  };
};

// biome-ignore lint/complexity/noBannedTypes: <explanation>
export class CustomHono<E extends Env = Env, S extends Schema = {}, BasePath extends string = '/'> extends OpenAPIHono<E, S, BasePath> {}

export type MenuItem2 = {
  userRole: 'ADMIN' | 'MEMBER';
  counts: { members: number; admins: number };
  name: string;
  id: string;
  slug: string;
  languages: string[];
  defaultLanguage: 'en' | 'nl';
  bannerUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: Date;
  modifiedAt: Date | null;
  modifiedBy: string | null;
  shortName: string | null;
  country: string | null;
  timezone: string | null;
  notificationEmail: string | null;
  emailDomains: string[] | null;
  brandColor: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  welcomeText: string | null;
  isProduction: boolean;
  authStrategies: string[] | null;
  chatSupport: boolean;
  createdBy: string | null;
};

export type MenuItem = {
  slug: string;
  id: string;
  createdAt: Date;
  modifiedAt: Date | null;
  name: string;
  thumbnailUrl: string | null;
  archived: boolean;
  muted: boolean;
  role: 'ADMIN' | 'MEMBER' | null;
  counts: {
    members: number;
    admins: number;
  };
};
