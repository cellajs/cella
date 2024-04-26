import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createJSONStorage } from 'zustand/middleware';

interface WorkspaceState {
  viewOptions: {
    status: ('iced' | 'unstarted' | 'started' | 'finished' | 'delivered' | 'reviewed' | 'accepted')[];
    type: ('feature' | 'bug' | 'chore')[];
  };
  displayOption: string;
  columns: Record<string, { width: string; minimized: boolean; expandAccepted: boolean; expandIced: boolean; recentLabels: string[] }>;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      immer((_) => ({
        viewOptions: {
          status: ['iced', 'unstarted', 'started', 'finished', 'delivered', 'reviewed', 'accepted'],
          type: ['feature', 'bug', 'chore'],
        },
        displayOption: 'table',
        columns: {
          'project-id': { width: '200px', minimized: false, expandAccepted: false, expandIced: false, recentLabels: [] },
        },
      })),
      {
        version: 1,
        name: 'workspace',
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
