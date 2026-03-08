import { create } from "zustand";
import { LOCATION_FILTER } from "@/config/filters";

export interface JobAnalysis {
  must_have_keywords: string[];
  good_to_have_keywords: string[];
  minimum_qualifications: string[];
  summary: string;
  compensation?: string | null;
  visa_status?: string | null;
}

export interface CustomSource {
  id: string;
  name: string;
  icon: string;
  url: string;
  ttl_hours: number;
  interval_minutes: number;
}

export interface Job {
  id?: number;
  external_id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: "LinkedIn" | "Fidelity" | "StateStreet" | "MathWorks" | "GitHub" | string;
  posted_at?: string;
  salary?: string;
  visa?: string;
  work_model?: string;
  is_new: boolean;
  is_notified?: boolean;
  created_at?: string;
  ttl?: number;
  analysis?: JobAnalysis;
  analysis_status?: "completed" | "unavailable" | null;
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
  updateJob: (externalId: string, updates: Partial<Job>) => void;
  setJobs: (jobs: Job[]) => void;
  setConnectionStatus: (status: "connecting" | "connected" | "disconnected") => void;
  setLoading: (loading: boolean) => void;
  clearJobs: () => void;
  savedJobIds: Set<string>;
  setSavedJobIds: (ids: string[]) => void;
  addSavedJobId: (id: string) => void;
  removeSavedJobId: (id: string) => void;
  dismissedJobIds: Set<string>;
  customSources: CustomSource[];
  setCustomSources: (sources: CustomSource[]) => void;
  addCustomSource: (source: CustomSource) => void;
  removeCustomSource: (id: string) => void;
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
  savedJobIds: new Set<string>(),
  dismissedJobIds: new Set<string>(),
  customSources: [],

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
    set((state) => {
      const newDismissed = new Set(state.dismissedJobIds);
      newDismissed.add(externalId);
      return {
        jobs: state.jobs.filter((j) => j.external_id !== externalId),
        linkedinJobs: state.linkedinJobs.filter((j) => j.external_id !== externalId),
        fidelityJobs: state.fidelityJobs.filter((j) => j.external_id !== externalId),
        statestreetJobs: state.statestreetJobs.filter((j) => j.external_id !== externalId),
        mathworksJobs: state.mathworksJobs.filter((j) => j.external_id !== externalId),
        githubJobs: state.githubJobs.filter((j) => j.external_id !== externalId),
        locationFilteredJobs: state.locationFilteredJobs.filter((j) => j.external_id !== externalId),
        dismissedJobIds: newDismissed,
      };
    }),

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

  updateJob: (externalId, updates) =>
    set((state) => {
      const updateList = (list: Job[]) =>
        list.map((j) => (j.external_id === externalId ? { ...j, ...updates } : j));

      return {
        jobs: updateList(state.jobs),
        linkedinJobs: updateList(state.linkedinJobs),
        fidelityJobs: updateList(state.fidelityJobs),
        statestreetJobs: updateList(state.statestreetJobs),
        mathworksJobs: updateList(state.mathworksJobs),
        githubJobs: updateList(state.githubJobs),
        locationFilteredJobs: updateList(state.locationFilteredJobs),
      };
    }),

  setJobs: (jobs) =>
    set((state) => {
      // Filter out any jobs that were dismissed during this session
      const filtered = jobs.filter((j) => !state.dismissedJobIds.has(j.external_id));
      return {
        jobs: filtered,
        linkedinJobs: filtered.filter((j) => j.source === "LinkedIn"),
        fidelityJobs: filtered.filter((j) => j.source === "Fidelity"),
        statestreetJobs: filtered.filter((j) => j.source === "StateStreet"),
        mathworksJobs: filtered.filter((j) => j.source === "MathWorks"),
        githubJobs: filtered.filter((j) => j.source === "GitHub"),
        locationFilteredJobs: filtered.filter(matchesLocationFilter),
      };
    }),

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
      dismissedJobIds: new Set<string>(),
    }),

  setSavedJobIds: (ids) => set({ savedJobIds: new Set(ids) }),
  
  addSavedJobId: (id) =>
    set((state) => {
      const newSet = new Set(state.savedJobIds);
      newSet.add(id);
      return { savedJobIds: newSet };
    }),

  removeSavedJobId: (id) =>
    set((state) => {
      const newSet = new Set(state.savedJobIds);
      newSet.delete(id);
      return { savedJobIds: newSet };
    }),

  setCustomSources: (sources) => set({ customSources: sources }),

  addCustomSource: (source) =>
    set((state) => ({
      customSources: [...state.customSources, source],
    })),

  removeCustomSource: (id) =>
    set((state) => ({
      customSources: state.customSources.filter((s) => s.id !== id),
    })),
}));
