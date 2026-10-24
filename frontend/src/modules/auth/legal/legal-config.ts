import type { AccessibilityReview, LegalTexts, SharedDataType, Subprocessor } from '~/modules/auth/legal/legal-types';
import { lazyNamed } from '~/utils/lazy-named';

export type LegalSubject = keyof typeof legalConfig;

/** Sections are declared statically so the legal page needs no DOM scanning. */
export const legalConfig = {
  privacy: {
    component: lazyNamed(() => import('~/modules/auth/legal/privacy-text'), 'PrivacyText'),
    label: 'c:privacy_policy',
    sections: [
      { id: 'overview', label: null },
      { id: 'how-we-use-data', label: 'Data we process' },
      { id: 'data-processing', label: 'Who sees your data' },
      { id: 'subprocessors', label: 'Subprocessors' },
      { id: 'cookies', label: 'Cookies and storage' },
      { id: 'security', label: 'Security' },
      { id: 'your-rights', label: 'Your rights' },
      { id: 'changes', label: 'Policy changes' },
    ],
  },
  terms: {
    component: lazyNamed(() => import('~/modules/auth/legal/terms-text'), 'TermsText'),
    label: 'c:terms_of_use',
    sections: [
      { id: 'overview', label: null },
      { id: 'agreement', label: 'Agreement' },
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
  accessibility: {
    component: lazyNamed(() => import('~/modules/auth/legal/accessibility-text'), 'AccessibilityText'),
    label: 'c:accessibility',
    sections: [
      { id: 'overview', label: null },
      { id: 'what-you-can-do', label: 'What you can do' },
      { id: 'known-limitations', label: 'Known limitations' },
      { id: 'how-we-test', label: 'How we test' },
    ],
  },
} as const satisfies LegalTexts;

export const legalSubjects = Object.keys(legalConfig) as [LegalSubject, ...LegalSubject[]];

/** Default legal subject used when no or an unknown subject is requested. */
export const defaultLegalSubject = legalSubjects[0];

/** Subprocessors handling personal data; `optional: true` marks services an app can filter out. */
export const subprocessors: Subprocessor[] = [
  {
    slug: 'scaleway',
    name: 'Scaleway',
    legalName: 'Scaleway SAS',
    website: 'https://www.scaleway.com/',
    servicesProvided: ['Server', 'Database', 'Object storage'],
    processingActivities: ['Hosting and storing customer data', 'Serving and transferring files'],
    categoriesOfPersonalData: ['Contact data', 'Identifiers', 'Customer content and files'],
    purposes: ['Service hosting and data storage', 'Backup and availability', 'Content delivery'],
    country: 'France',
    dpa: { signed: true, effectiveDate: '2022-07-01', url: 'https://www.scaleway.com/en/terms-and-conditions/data-processing-agreement/' },
  },
  {
    slug: 'brevo',
    name: 'Brevo',
    legalName: 'Brevo',
    website: 'https://www.brevo.com/',
    servicesProvided: ['Transactional email delivery'],
    processingActivities: ['Sending verification, notification and system emails'],
    categoriesOfPersonalData: ['Email addresses', 'Names', 'Email content'],
    purposes: ['Transactional email delivery', 'Email deliverability tracking'],
    country: 'France',
    dpa: { signed: true, effectiveDate: '2023-01-01', url: 'https://www.brevo.com/legal/termsofuse/#data-processing-agreement' },
  },
  {
    slug: 'transloadit',
    name: 'Transloadit',
    legalName: 'Transloadit Ltd.',
    website: 'https://transloadit.com/',
    servicesProvided: ['File processing', 'Image and video encoding'],
    processingActivities: ['Transforming, validating and encoding uploaded files'],
    categoriesOfPersonalData: ['Uploaded files', 'File metadata'],
    purposes: ['File transformation and validation', 'Image processing'],
    country: 'Germany',
    dpa: { signed: true, effectiveDate: '2023-01-01', url: 'https://transloadit.com/legal/dpa/' },
    optional: true,
  },
  {
    slug: 'gleap',
    name: 'Gleap',
    legalName: 'Gleap GmbH',
    website: 'https://gleap.io/',
    servicesProvided: ['Customer support', 'Bug reporting'],
    processingActivities: ['Collecting and storing support messages, feedback and browser context'],
    categoriesOfPersonalData: ['Email addresses', 'Support messages', 'Browser and page context'],
    purposes: ['Customer support', 'Bug reporting and feedback'],
    country: 'Austria',
    dpa: { signed: true, effectiveDate: '2023-01-01', url: 'https://gleap.io/privacy-policy/' },
    optional: true,
  },
  {
    slug: 'maple',
    name: 'Maple',
    legalName: 'Makisuo, Inc.',
    website: 'https://maple.dev/',
    servicesProvided: ['Error and performance monitoring'],
    processingActivities: ['Collecting errors, traces and performance data'],
    categoriesOfPersonalData: ['IP addresses', 'User ids', 'Browser data', 'Pages visited'],
    purposes: ['Finding and fixing errors and slow pages'],
    country: 'United States',
    dpa: { signed: false, effectiveDate: '', url: '' },
    optional: true,
  },
  {
    slug: 'onedollarstats',
    name: 'One Dollar Stats',
    legalName: 'One Dollar Stats',
    website: 'https://onedollarstats.com/',
    servicesProvided: ['Page visit statistics'],
    processingActivities: ['Counting page visits without cookies'],
    categoriesOfPersonalData: ['Hashed IP address and browser', 'Pages visited'],
    purposes: ['Counting visits to our pages'],
    country: 'Ukraine (servers in Finland)',
    dpa: { signed: false, effectiveDate: '', url: '' },
  },
];

/** Personal data we process as controller; content an organization controls is left out (we process it on its behalf). */
export const sharedDataTypes: SharedDataType[] = [
  {
    slug: 'account',
    name: 'Account',
    purpose: 'Provide your account and memberships, sign you in and send you service emails.',
    legalBasis: 'Contract',
    dataCategories: ['name', 'email address', 'profile', 'sign-in methods', 'preferences', 'organizations and roles'],
    dataSubjects: ['end users'],
    storageLocation: 'Primary database (EU)',
    retentionPeriod:
      'Until you delete your account, and the history of your changes 90 days longer. What you created stays with your organization, credited to a deleted user. Email delivery logs: 30 days.',
  },
  {
    slug: 'auth_sessions',
    name: 'Sessions and devices',
    purpose: 'Keep you signed in, warn you about new devices and limit abuse.',
    legalBasis: 'Contract and legitimate interest',
    dataCategories: ['device and browser', 'hashed IP address with country and network'],
    dataSubjects: ['end users'],
    storageLocation: 'Primary database (EU)',
    retentionPeriod: 'Sessions: 30 days after they end. Known devices: 400 days after you last signed in from one, or until you delete your account.',
  },
  {
    slug: 'activity',
    name: 'Activity',
    purpose: 'Sync changes between your devices and notify you.',
    legalBasis: 'Contract',
    dataCategories: ['history of your changes', 'notifications', 'what you have seen'],
    dataSubjects: ['end users'],
    storageLocation: 'Primary database (EU)',
    retentionPeriod: '90 days.',
  },
  {
    slug: 'page_visits',
    name: 'Page visits',
    purpose: 'Count visits to our pages.',
    legalBasis: 'Legitimate interest',
    dataCategories: ['pages visited', 'referrer', 'country', 'hash of IP address and browser'],
    dataSubjects: ['visitors', 'end users'],
    storageLocation: 'One Dollar Stats (Finland)',
    retentionPeriod: 'The visitor hash changes daily.',
  },
  {
    slug: 'error_data',
    name: 'Monitoring',
    purpose: 'Find and fix errors and slow pages.',
    legalBasis: 'Legitimate interest',
    dataCategories: ['errors and performance data', 'pages visited', 'browser', 'IP address', 'user and session ids'],
    dataSubjects: ['end users'],
    storageLocation: 'Maple (US)',
    retentionPeriod: '30 days by default.',
    optional: true,
  },
];

/**
 * Accessibility review results the statement shows, nothing is claimed before a review. `pnpm -C a11y report --publish`
 * prints them from the ledger; the descriptions are shortened here for the statement's reader.
 */
export const accessibilityReview: AccessibilityReview = {
  standard: 'WCAG 2.2 Level AA',
  reviewedAt: '2026-10-03',
  provisional: true,
  results: {
    pagesAndStates: 26,
    supports: 43,
    partiallySupports: 3,
    doesNotSupport: 0,
    notApplicable: 6,
    notEvaluated: ['2.4.5 Multiple Ways', '4.1.2 Name, Role, Value', '4.1.3 Status Messages'],
  },
  limitations: [
    {
      description: 'Long names in the menu are cut off when you increase the spacing of text.',
      criteria: ['1.4.12'],
    },
    {
      description: 'Short confirmation messages close by themselves after 4 seconds.',
      criteria: ['2.2.1'],
      workaround:
        'With more contrast, turned on under Preferences or on your device, they stay until you close them. You can also hover a message or press F6 to hold it.',
    },
    {
      description: 'Setting up an authenticator app must be finished within 5 minutes.',
      criteria: ['2.2.1'],
      workaround: 'After that you can start again with a new QR code.',
    },
    {
      description: 'The width of the docs sidebar and of table columns can only be set freely by dragging.',
      criteria: ['2.5.7'],
      workaround: 'A double-click resets the sidebar or fits a column to its content, and the keyboard resizes both.',
    },
  ],
  report: { edition: 'VPAT® 2.5Rev WCAG', date: '2026-10-03', pdfUrl: '/static/common/accessibility-conformance-report.pdf' },
};
