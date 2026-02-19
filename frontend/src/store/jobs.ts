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
  ttl?: number;
}

interface JobsState {
  jobs: Job[];
  linkedinJobs: Job[];
  jobrightJobs: Job[];
  jobrightMinisitesJobs: Job[];
  connectionStatus: "connecting" | "connected" | "disconnected";
  isLoading: boolean;
  addJob: (job: Job) => void;
  setJobs: (jobs: Job[]) => void;
  setConnectionStatus: (status: "connecting" | "connected" | "disconnected") => void;
  setLoading: (loading: boolean) => void;
  clearJobs: () => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  linkedinJobs: [],
  jobrightJobs: [],
  jobrightMinisitesJobs: [],
  connectionStatus: "disconnected",
  isLoading: true,

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

  setJobs: (jobs) =>
    set(() => ({
      jobs,
      linkedinJobs: jobs.filter((j) => j.source === "LinkedIn"),
      jobrightJobs: jobs.filter((j) => j.source === "Jobright"),
      jobrightMinisitesJobs: jobs.filter((j) => j.source === "JobrightMiniSites"),
    })),

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  setLoading: (isLoading) => set({ isLoading }),

  clearJobs: () =>
    set({
      jobs: [],
      linkedinJobs: [],
      jobrightJobs: [],
      jobrightMinisitesJobs: [],
    }),
}));
