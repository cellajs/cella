declare const data: {
  slug: string;
  name: string;
  legalName: string;
  website: string;
  servicesProvided: string[];
  processingActivities: string[];
  categoriesOfPersonalData: string[];
  dataSubjects: string[];
  purposes: string[];
  country: string;
  dpa: {
    signed: boolean;
    effectiveDate: string; // 'YYYY-MM-DD'
    url: string;
  },
  riskRating: 'low' | 'medium' | 'high';
}[];
export default data;
