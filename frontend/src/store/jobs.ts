import { create } from "zustand";
import { LOCATION_FILTER } from "@/config/filters";

export interface Job {
  id?: number;
  external_id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: "LinkedIn" | "Jobright" | "JobrightMiniSites" | "Fidelity" | "StateStreet" | "MathWorks";
  posted_at?: string;
  salary?: string;
  work_model?: string;
  is_new: boolean;
  created_at?: string;
  ttl?: number;
}

const matchesLocationFilter = (job: Job): boolean => {
  if (!LOCATION_FILTER.enabled) return false;
  const location = job.location;
  const locationLower = location.toLowerCase();
  
  const hasStateMatch = LOCATION_FILTER.exactStatePatterns.some(pattern => 
    location.includes(pattern) || locationLower.includes(pattern.toLowerCase())
  );
  if (hasStateMatch) return true;
  
  const hasCityMatch = LOCATION_FILTER.cityPatterns.some(city => {
    const cityLower = city.toLowerCase();
    const regex = new RegExp(`\\b${cityLower}\\b`, 'i');
    return regex.test(location);
  });
  
  return hasCityMatch;
};

interface JobsState {
  jobs: Job[];
  linkedinJobs: Job[];
  allJobrightJobs: Job[];
  fidelityJobs: Job[];
  statestreetJobs: Job[];
  mathworksJobs: Job[];
  locationFilteredJobs: Job[];
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
  allJobrightJobs: [],
  fidelityJobs: [],
  statestreetJobs: [],
  mathworksJobs: [],
  locationFilteredJobs: [],
  connectionStatus: "disconnected",
  isLoading: true,

  addJob: (job) =>
    set((state) => {
      const exists = state.jobs.some((j) => j.external_id === job.external_id);
      if (exists) return state;

      const newJobs = [job, ...state.jobs];
      const isJobright = job.source === "Jobright" || job.source === "JobrightMiniSites";
      
      return {
        jobs: newJobs,
        linkedinJobs: job.source === "LinkedIn" 
          ? [job, ...state.linkedinJobs] 
          : state.linkedinJobs,
        allJobrightJobs: isJobright
          ? [job, ...state.allJobrightJobs] 
          : state.allJobrightJobs,
        fidelityJobs: job.source === "Fidelity"
          ? [job, ...state.fidelityJobs]
          : state.fidelityJobs,
        statestreetJobs: job.source === "StateStreet"
          ? [job, ...state.statestreetJobs]
          : state.statestreetJobs,
        mathworksJobs: job.source === "MathWorks"
          ? [job, ...state.mathworksJobs]
          : state.mathworksJobs,
        locationFilteredJobs: matchesLocationFilter(job)
          ? [job, ...state.locationFilteredJobs]
          : state.locationFilteredJobs,
      };
    }),

  setJobs: (jobs) =>
    set(() => ({
      jobs,
      linkedinJobs: jobs.filter((j) => j.source === "LinkedIn"),
      allJobrightJobs: jobs.filter((j) => j.source === "Jobright" || j.source === "JobrightMiniSites"),
      fidelityJobs: jobs.filter((j) => j.source === "Fidelity"),
      statestreetJobs: jobs.filter((j) => j.source === "StateStreet"),
      mathworksJobs: jobs.filter((j) => j.source === "MathWorks"),
      locationFilteredJobs: jobs.filter(matchesLocationFilter),
    })),

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  setLoading: (isLoading) => set({ isLoading }),

  clearJobs: () =>
    set({
      jobs: [],
      linkedinJobs: [],
      allJobrightJobs: [],
      fidelityJobs: [],
      statestreetJobs: [],
      mathworksJobs: [],
      locationFilteredJobs: [],
    }),
}));
