import { create } from "zustand";

export interface Job {
  id?: number;
  external_id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: "LinkedIn" | "Jobright" | "JobrightMiniSites" | "Fidelity" | "StateStreet";
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
  fidelityJobs: Job[];
  statestreetJobs: Job[];
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
  fidelityJobs: [],
  statestreetJobs: [],
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
        fidelityJobs: job.source === "Fidelity"
          ? [job, ...state.fidelityJobs]
          : state.fidelityJobs,
        statestreetJobs: job.source === "StateStreet"
          ? [job, ...state.statestreetJobs]
          : state.statestreetJobs,
      };
    }),

  setJobs: (jobs) =>
    set(() => ({
      jobs,
      linkedinJobs: jobs.filter((j) => j.source === "LinkedIn"),
      jobrightJobs: jobs.filter((j) => j.source === "Jobright"),
      jobrightMinisitesJobs: jobs.filter((j) => j.source === "JobrightMiniSites"),
      fidelityJobs: jobs.filter((j) => j.source === "Fidelity"),
      statestreetJobs: jobs.filter((j) => j.source === "StateStreet"),
    })),

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  setLoading: (isLoading) => set({ isLoading }),

  clearJobs: () =>
    set({
      jobs: [],
      linkedinJobs: [],
      jobrightJobs: [],
      jobrightMinisitesJobs: [],
      fidelityJobs: [],
      statestreetJobs: [],
    }),
}));
