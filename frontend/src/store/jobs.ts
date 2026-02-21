import { create } from "zustand";
import { LOCATION_FILTER } from "@/config/filters";

export interface Job {
  id?: number;
  external_id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: "LinkedIn" | "Fidelity" | "StateStreet" | "MathWorks" | "GitHub";
  posted_at?: string;
  salary?: string;
  work_model?: string;
  is_new: boolean;
  is_notified?: boolean;
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
  fidelityJobs: Job[];
  statestreetJobs: Job[];
  mathworksJobs: Job[];
  githubJobs: Job[];
  locationFilteredJobs: Job[];
  connectionStatus: "connecting" | "connected" | "disconnected";
  isLoading: boolean;
  addJob: (job: Job) => void;
  removeJob: (externalId: string) => void;
  removeJobsByCompany: (company: string) => void;
  setJobs: (jobs: Job[]) => void;
  setConnectionStatus: (status: "connecting" | "connected" | "disconnected") => void;
  setLoading: (loading: boolean) => void;
  clearJobs: () => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  linkedinJobs: [],
  fidelityJobs: [],
  statestreetJobs: [],
  mathworksJobs: [],
  githubJobs: [],
  locationFilteredJobs: [],
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
        fidelityJobs: job.source === "Fidelity"
          ? [job, ...state.fidelityJobs]
          : state.fidelityJobs,
        statestreetJobs: job.source === "StateStreet"
          ? [job, ...state.statestreetJobs]
          : state.statestreetJobs,
        mathworksJobs: job.source === "MathWorks"
          ? [job, ...state.mathworksJobs]
          : state.mathworksJobs,
        githubJobs: job.source === "GitHub"
          ? [job, ...state.githubJobs]
          : state.githubJobs,
        locationFilteredJobs: matchesLocationFilter(job)
          ? [job, ...state.locationFilteredJobs]
          : state.locationFilteredJobs,
      };
    }),

  removeJob: (externalId) =>
    set((state) => ({
      jobs: state.jobs.filter((j) => j.external_id !== externalId),
      linkedinJobs: state.linkedinJobs.filter((j) => j.external_id !== externalId),
      fidelityJobs: state.fidelityJobs.filter((j) => j.external_id !== externalId),
      statestreetJobs: state.statestreetJobs.filter((j) => j.external_id !== externalId),
      mathworksJobs: state.mathworksJobs.filter((j) => j.external_id !== externalId),
      githubJobs: state.githubJobs.filter((j) => j.external_id !== externalId),
      locationFilteredJobs: state.locationFilteredJobs.filter((j) => j.external_id !== externalId),
    })),

  removeJobsByCompany: (company) =>
    set((state) => ({
      jobs: state.jobs.filter((j) => j.company !== company),
      linkedinJobs: state.linkedinJobs.filter((j) => j.company !== company),
      fidelityJobs: state.fidelityJobs.filter((j) => j.company !== company),
      statestreetJobs: state.statestreetJobs.filter((j) => j.company !== company),
      mathworksJobs: state.mathworksJobs.filter((j) => j.company !== company),
      githubJobs: state.githubJobs.filter((j) => j.company !== company),
      locationFilteredJobs: state.locationFilteredJobs.filter((j) => j.company !== company),
    })),

  setJobs: (jobs) =>
    set(() => ({
      jobs,
      linkedinJobs: jobs.filter((j) => j.source === "LinkedIn"),
      fidelityJobs: jobs.filter((j) => j.source === "Fidelity"),
      statestreetJobs: jobs.filter((j) => j.source === "StateStreet"),
      mathworksJobs: jobs.filter((j) => j.source === "MathWorks"),
      githubJobs: jobs.filter((j) => j.source === "GitHub"),
      locationFilteredJobs: jobs.filter(matchesLocationFilter),
    })),

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  setLoading: (isLoading) => set({ isLoading }),

  clearJobs: () =>
    set({
      jobs: [],
      linkedinJobs: [],
      fidelityJobs: [],
      statestreetJobs: [],
      mathworksJobs: [],
      githubJobs: [],
      locationFilteredJobs: [],
    }),
}));
