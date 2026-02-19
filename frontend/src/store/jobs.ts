import { create } from "zustand";

export interface Job {
  id?: number;
  external_id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: "LinkedIn" | "Jobright" | "JobrightMiniSites";
  posted_at?: string;
  salary?: string;
  work_model?: string;
  is_new: boolean;
  created_at?: string;
}

interface JobsState {
  jobs: Job[];
  linkedinJobs: Job[];
  jobrightJobs: Job[];
  jobrightMinisitesJobs: Job[];
  connectionStatus: "connecting" | "connected" | "disconnected";
  addJob: (job: Job) => void;
  setConnectionStatus: (status: "connecting" | "connected" | "disconnected") => void;
  clearJobs: () => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  linkedinJobs: [],
  jobrightJobs: [],
  jobrightMinisitesJobs: [],
  connectionStatus: "disconnected",

  addJob: (job) =>
    set((state) => {
      const exists = state.jobs.some((j) => j.external_id === job.external_id);
      if (exists) return state;

      const newJobs = [job, ...state.jobs];
      
      return {
        jobs: newJobs,
        linkedinJobs: job.source === "LinkedIn" 
          ? [job, ...state.linkedinJobs] 
          : state.linkedinJobs,
        jobrightJobs: job.source === "Jobright" 
          ? [job, ...state.jobrightJobs] 
          : state.jobrightJobs,
        jobrightMinisitesJobs: job.source === "JobrightMiniSites" 
          ? [job, ...state.jobrightMinisitesJobs] 
          : state.jobrightMinisitesJobs,
      };
    }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  clearJobs: () =>
    set({
      jobs: [],
      linkedinJobs: [],
      jobrightJobs: [],
      jobrightMinisitesJobs: [],
    }),
}));
