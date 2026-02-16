/**
 * Base route segments - upstream owned.
 * Forks should NOT modify this file. Instead, spread these in route-tree.tsx.
 */
import { NavItemId } from '~/modules/navigation/types';
import {
  AuthErrorRoute,
  AuthenticateRoute,
  AuthLayoutRoute,
  CreatePasswordWithTokenRoute,
  EmailVerificationRoute,
  MfaRoute,
  RequestPasswordRoute,
  SignOutRoute,
  UnsubscribedRoute,
} from '~/routes/auth-routes';
import { AppLayoutRoute, ErrorNoticeRoute, PublicLayoutRoute, RootRoute } from '~/routes/base-routes';
import {
  DocsLayoutRoute,
  DocsOperationsRoute,
  DocsOperationsTableRoute,
  DocsOverviewRoute,
  DocsPageEditRoute,
  DocsPageRoute,
  DocsPagesRoute,
  DocsSchemasRoute,
} from '~/routes/docs-routes';
import { HomeAliasRoute, HomeRoute, WelcomeRoute } from '~/routes/home-routes';
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalIndexRoute, LegalRoute } from '~/routes/marketing-routes';
import {
  OrganizationAttachmentsRoute,
  OrganizationLayoutRoute,
  OrganizationMembersRoute,
  OrganizationRoute,
  OrganizationSettingsRoute,
} from '~/routes/organization-routes';
import {
  MetricsRoute,
  OrganizationsTableRoute,
  RequestsTableRoute,
  SystemRoute,
  TenantsTableRoute,
  UsersTableRoute,
} from '~/routes/system-routes';
import { UserAccountRoute } from '~/routes/user-routes';
import { BoundaryType } from './types';

// Re-export layout routes and individual routes for fork extensions
export {
  // Layouts
  RootRoute,
  PublicLayoutRoute,
  AppLayoutRoute,
  AuthLayoutRoute,
  OrganizationLayoutRoute,
  OrganizationRoute,
  SystemRoute,
  DocsLayoutRoute,
  // Individual routes forks might need
  HomeRoute,
  HomeAliasRoute,
  WelcomeRoute,
  UserAccountRoute,
};

/** Base public children (marketing pages, without auth/docs layouts) */
export const basePublicChildren = [
  AboutRoute,
  ContactRoute,
  LegalIndexRoute,
  LegalRoute,
  AccessibilityRoute,
  ErrorNoticeRoute,
  SignOutRoute,
] as const;

/** Base auth children (inside AuthLayoutRoute) */
export const baseAuthChildren = [
  AuthenticateRoute,
  MfaRoute,
  RequestPasswordRoute,
  CreatePasswordWithTokenRoute,
  EmailVerificationRoute,
  UnsubscribedRoute,
  AuthErrorRoute,
] as const;

/** Base docs children (inside DocsLayoutRoute) */
export const baseDocsChildren = [
  DocsOperationsRoute,
  DocsOperationsTableRoute,
  DocsOverviewRoute,
  DocsSchemasRoute,
  DocsPagesRoute,
  DocsPageRoute,
  DocsPageEditRoute,
] as const;

/** Base organization children (inside OrganizationRoute) */
export const baseOrganizationChildren = [
  OrganizationMembersRoute,
  OrganizationAttachmentsRoute,
  OrganizationSettingsRoute,
] as const;

/** Base system children (inside SystemRoute) */
export const baseSystemChildren = [
  UsersTableRoute,
  OrganizationsTableRoute,
  RequestsTableRoute,
  MetricsRoute,
  TenantsTableRoute,
] as const;

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    boundary?: BoundaryType;
    isAuth: boolean;
    floatingNavButtons?: {
      right?: NavItemId;
      left?: NavItemId;
    };
    /** Tab metadata for PageTabNav - if defined, this route will appear as a nav tab */
    navTab?: {
      id: string;
      label: string;
    };
  }
}
