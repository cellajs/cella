export interface PivotalTask {
  Id: string;
  Title: string;
  Type: string;
  Priority: string;
  Estimate: string;
  Description: string;
  Labels: string;
  'Current State': string;
  // Jan 7, 2024
  'Created at': string;
  Task: string;
  'Task Status': string;
  Task_1: string;
  'Task Status_1': string;
  Task_2: string;
  'Task Status_2': string;
  Task_3: string;
  'Task Status_3': string;
  Task_4: string;
  'Task Status_4': string;
  Task_5: string;
  'Task Status_5': string;
  Task_6: string;
  'Task Status_6': string;
  Task_7: string;
  'Task Status_7': string;
  Task_8: string;
  'Task Status_8': string;
  Task_9: string;
  'Task Status_9': string;
  Task_10: string;
  'Task Status_10': string;
  Task_11: string;
  'Task Status_11': string;
  Task_12: string;
  'Task Status_12': string;
  Task_13: string;
  'Task Status_13': string;
  Task_14: string;
  'Task Status_14': string;
  Task_15: string;
  'Task Status_15': string;
  Task_16: string;
  'Task Status_16': string;
  Task_17: string;
  'Task Status_17': string;
  Task_18: string;
  'Task Status_18': string;
  Task_19: string;
  'Task Status_19': string;
  Task_20: string;
  'Task Status_20': string;
  Task_21: string;
  'Task Status_21': string;
  Task_22: string;
  'Task Status_22': string;
  Task_23: string;
  'Task Status_23': string;
  Task_24: string;
  'Task Status_24': string;
  Task_25: string;
  'Task Status_25': string;
  Task_26: string;
  'Task Status_26': string;
  Task_27: string;
  'Task Status_27': string;
}

export interface Labels {
  id: string;
  name: string;
  color: string;
  organizationId: string;
  projectId: string;
  lastUsedAt: Date;
  useCount: number;
}

export interface Subtask {
  id: string;
  slug: string;
  summary: string;
  type: 'chore';
  parentId: string;
  createdBy: string;
  organizationId: string;
  projectId: string;
  impact: number;
  description: string;
  status: number;
  order: number;
  createdAt: Date;
  keywords: string;
  expandable: boolean;
}
