import { lazy } from 'react';
import type {
  CollectedDataCategory,
  LegalTexts,
  SharedDataType,
  Subprocessor,
} from '~/modules/marketing/legal/legal-types';

export type LegalSubject = keyof typeof legalConfig;

/**
 * Config to set legal text components to be used in Legal page.
 * Sections are defined statically to avoid DOM scanning.
 */
export const legalConfig = {
  privacy: {
    component: lazy(() => import('~/modules/marketing/legal/privacy-text')),
    label: 'common:privacy_policy',
    sections: [
      { id: 'overview', label: null },
      { id: 'introduction', label: 'Introduction' },
      { id: 'data-we-collect', label: 'Data we collect' },
      { id: 'how-we-use-data', label: 'How we use data' },
      { id: 'data-sharing', label: 'Data sharing' },
      { id: 'cookies', label: 'Cookies' },
      { id: 'data-retention', label: 'Data retention' },
      { id: 'security', label: 'Security' },
      { id: 'your-rights', label: 'Your rights' },
      { id: 'changes', label: 'Policy changes' },
      { id: 'subprocessors', label: 'Subprocessors' },
      { id: 'shared-data-types', label: 'Shared data' },
    ],
  },
  terms: {
    component: lazy(() => import('~/modules/marketing/legal/terms-text')),
    label: 'common:terms_of_use',
    sections: [
      { id: 'overview', label: null },
      { id: 'introduction', label: 'Introduction' },
      { id: 'agreement', label: 'Agreement' },
      { id: 'privacy', label: 'Privacy' },
      { id: 'accounts', label: 'Accounts' },
      { id: 'acceptable-use', label: 'Acceptable use' },
      { id: 'intellectual-property', label: 'Intellectual property' },
      { id: 'service-changes', label: 'Service changes' },
      { id: 'termination', label: 'Termination' },
      { id: 'disclaimers', label: 'Disclaimers' },
      { id: 'liability', label: 'Liability' },
      { id: 'indemnification', label: 'Indemnification' },
      { id: 'governing-law', label: 'Governing law' },
      { id: 'general', label: 'General' },
    ],
  },
} as const satisfies LegalTexts;

/**
 * Categories of personal data collected by the service.
 * Forks should update these to match their actual data collection.
 */
export const collectedData: CollectedDataCategory[] = [
  {
    label: 'Account information',
    description: 'When you create an account we collect:',
    items: ['Name', 'Email address', 'Authentication credentials'],
  },
  {
    label: 'User-generated content',
    description: 'Content you or your organization members create, upload or share through the Service, including:',
    items: [
      'Tasks, projects and workspace data',
      'Attachments (images, files, videos)',
      'Profile information (name, avatar, biography)',
    ],
  },
  {
    label: 'Automatically collected data',
    description: 'When you interact with the Service we automatically collect:',
    items: [
      'Browser type and version',
      'Anonymized count of pages and data requested',
      'Anonymized IP addresses (for rate limiting and security)',
    ],
  },
];

/**
 * Subprocessors that handle personal data on behalf of the service.
 * Mark optional services with `optional: true` — forks can filter by this.
 */
export const subprocessors: Subprocessor[] = [
  {
    slug: 'scaleway-os',
    name: 'Scaleway Object Storage',
    legalName: 'Scaleway SAS',
    website: 'https://www.scaleway.com/',
    servicesProvided: ['Cloud infrastructure', 'Object storage (S3 API compatible)'],
    processingActivities: ['Hosting and storing customer data', 'Serving and transferring stored objects via API'],
    categoriesOfPersonalData: ['Contact data', 'Identifiers', 'Customer content and files (as uploaded by controller)'],
    dataSubjects: ['Customers', 'End users of customer applications'],
    purposes: ['Service hosting and data storage', 'Backup and availability', 'Content delivery'],
    country: 'France',
    dpa: {
      signed: true,
      effectiveDate: '2022-07-01',
      url: 'https://www.scaleway.com/en/terms-and-conditions/data-processing-agreement/',
    },
    riskRating: 'low',
  },
  {
    slug: 'brevo',
    name: 'Brevo',
    legalName: 'Brevo (formerly Sendinblue)',
    website: 'https://www.brevo.com/',
    servicesProvided: ['Transactional email delivery'],
    processingActivities: ['Sending verification, notification and system emails on behalf of controller'],
    categoriesOfPersonalData: ['Email addresses', 'Names', 'Email content'],
    dataSubjects: ['End users'],
    purposes: ['Transactional email delivery', 'Email deliverability tracking'],
    country: 'France',
    dpa: {
      signed: true,
      effectiveDate: '2023-01-01',
      url: 'https://www.brevo.com/legal/termsofuse/#data-processing-agreement',
    },
    riskRating: 'low',
  },
  {
    slug: 'sentry',
    name: 'Sentry',
    legalName: 'Functional Software, Inc.',
    website: 'https://sentry.io/',
    servicesProvided: ['Error tracking', 'Performance monitoring'],
    processingActivities: ['Collecting and storing error reports, stacktraces, and performance metrics'],
    categoriesOfPersonalData: ['Browser and device metadata', 'IP addresses (anonymized)', 'Error context'],
    dataSubjects: ['End users'],
    purposes: ['Application error monitoring', 'Performance optimization'],
    country: 'United States',
    dpa: {
      signed: true,
      effectiveDate: '2023-01-01',
      url: 'https://sentry.io/legal/dpa/',
    },
    riskRating: 'low',
    optional: true,
  },
  {
    slug: 'transloadit',
    name: 'Transloadit',
    legalName: 'Transloadit Ltd.',
    website: 'https://transloadit.com/',
    servicesProvided: ['File processing', 'Image and video encoding'],
    processingActivities: ['Transforming, validating and encoding uploaded files'],
    categoriesOfPersonalData: ['Uploaded files', 'File metadata'],
    dataSubjects: ['End users', 'Organization members'],
    purposes: ['File transformation and validation', 'Image processing'],
    country: 'Germany',
    dpa: {
      signed: true,
      effectiveDate: '2023-01-01',
      url: 'https://transloadit.com/legal/dpa/',
    },
    riskRating: 'low',
    optional: true,
  },
  {
    slug: 'paddle',
    name: 'Paddle',
    legalName: 'Paddle.com Market Ltd.',
    website: 'https://www.paddle.com/',
    servicesProvided: ['Payment processing', 'Subscription management'],
    processingActivities: ['Processing payments', 'Managing subscription lifecycle'],
    categoriesOfPersonalData: ['Customer identifiers', 'Subscription and payment data'],
    dataSubjects: ['Customers'],
    purposes: ['Payment processing', 'Subscription billing'],
    country: 'United Kingdom',
    dpa: {
      signed: true,
      effectiveDate: '2023-01-01',
      url: 'https://www.paddle.com/legal/dpa',
    },
    riskRating: 'low',
    optional: true,
  },
  {
    slug: 'gleap',
    name: 'Gleap',
    legalName: 'Gleap GmbH',
    website: 'https://gleap.io/',
    servicesProvided: ['Customer support chat', 'Bug reporting'],
    processingActivities: ['Collecting and storing support messages, feedback and browser context'],
    categoriesOfPersonalData: ['Email addresses', 'Support messages', 'Browser and page context'],
    dataSubjects: ['End users'],
    purposes: ['Customer support', 'Bug reporting and feedback'],
    country: 'Austria',
    dpa: {
      signed: true,
      effectiveDate: '2023-01-01',
      url: 'https://gleap.io/privacy-policy/',
    },
    riskRating: 'low',
    optional: true,
  },
];

/**
 * Shared data types describing how personal data flows through the service.
 * Mark optional types with `optional: true` — forks can filter by this.
 */
export const sharedDataTypes: SharedDataType[] = [
  {
    slug: 'user_profile',
    name: 'User profile data',
    purpose: 'Store user identity and preferences for authentication and personalization.',
    legalBasis: 'contract',
    dataCategories: ['name', 'email address', 'avatar', 'language preference'],
    dataSubjects: ['end users'],
    storageLocation: 'Primary database (EU)',
    retentionPeriod: 'Retained until account deletion, then permanently removed within 90 days.',
  },
  {
    slug: 'auth_sessions',
    name: 'Authentication sessions',
    purpose: 'Maintain authenticated sessions and manage secure access.',
    legalBasis: 'contract',
    dataCategories: ['session tokens', 'OAuth tokens', 'refresh tokens'],
    dataSubjects: ['end users'],
    storageLocation: 'Primary database (EU)',
    retentionPeriod: 'Tokens expire on logout or after 30 days of inactivity.',
  },
  {
    slug: 'organization_membership',
    name: 'Organization membership',
    purpose: 'Manage roles, permissions and membership within organizations.',
    legalBasis: 'contract',
    dataCategories: ['membership role', 'permissions', 'join date'],
    dataSubjects: ['organization members'],
    storageLocation: 'Primary database (EU)',
    retentionPeriod: 'Retained until membership is removed or organization is deleted.',
  },
  {
    slug: 'user_uploads',
    name: 'User file uploads',
    purpose: 'Store and deliver user-uploaded files within the workspace.',
    legalBasis: 'contract',
    dataCategories: ['user files', 'file metadata (names, timestamps, owner ID)'],
    dataSubjects: ['end users', 'organization members'],
    storageLocation: 'Scaleway Object Storage (EU)',
    retentionPeriod: 'Files retained until deleted by the user or up to 90 days after account deletion.',
  },
  {
    slug: 'transactional_emails',
    name: 'Transactional emails',
    purpose: 'Send system emails such as verification, password reset and notifications.',
    legalBasis: 'contract',
    dataCategories: ['email address', 'email content', 'delivery status'],
    dataSubjects: ['end users'],
    storageLocation: 'Brevo (EU)',
    retentionPeriod: 'Email logs retained for 30 days.',
  },
  {
    slug: 'error_data',
    name: 'Error and performance data',
    purpose: 'Collect application errors and performance metrics for reliability.',
    legalBasis: 'legitimate interest',
    dataCategories: ['error stacktraces', 'browser metadata', 'anonymized IP addresses'],
    dataSubjects: ['end users'],
    storageLocation: 'Sentry (EU/US)',
    retentionPeriod: 'Retained per Sentry plan settings (default 90 days).',
    optional: true,
  },
];
