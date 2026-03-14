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
  disable_javascript?: boolean;
  status?: string;
  status_message?: string;
}

export interface Job {
  id?: number;
  external_id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: "LinkedIn" | "MathWorks" | "GitHub" | string;
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
  is_custom?: boolean;
}

interface LocationNormalized {
  full_name: string;
  abbreviation: string;
  cities: string[];
  state_patterns: string[];
}

const matchesLocationFilter = (job: Job, normalized: LocationNormalized | null): boolean => {
  // Use dynamic normalized data if available, else fall back to static config
  if (normalized) {
    const location = job.location;
    const locationLower = location.toLowerCase();

    const hasStateMatch = normalized.state_patterns.some(pattern =>
      location.includes(pattern) || locationLower.includes(pattern.toLowerCase())
    );
    if (hasStateMatch) return true;

    const hasCityMatch = normalized.cities.some(city => {
      const cityLower = city.toLowerCase();
      const regex = new RegExp(`\\b${cityLower}\\b`, 'i');
      return regex.test(location);
    });
    return hasCityMatch;
  }

  // Fallback to static LOCATION_FILTER
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
  jobrightJobs: Job[];
  mathworksJobs: Job[];
  githubJobs: Job[];
  locationFilteredJobs: Job[];
  locationFilterLocation: string | null;
  locationFilterNormalized: LocationNormalized | null;
  nextLinkedinScrape: string | null;
  nextLocationScrape: string | null;
  connectionStatus: "connecting" | "connected" | "disconnected";
  isLoading: boolean;
  addJob: (job: Job) => void;
  removeJob: (externalId: string) => void;
  removeJobsByCompany: (company: string) => void;
  updateJob: (externalId: string, updates: Partial<Job>) => void;
  setJobs: (jobs: Job[]) => void;
  setLocationFilter: (location: string | null, normalized: LocationNormalized | null) => void;
  setNextScrape: (scraper: string, nextAt: string) => void;
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
  updateCustomSource: (id: string, updates: Partial<CustomSource>) => void;
  sourceStatuses: Record<string, { status: string; message: string }>;
  setSourceStatus: (id: string, status: string, message: string) => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  linkedinJobs: [],
  jobrightJobs: [],
  mathworksJobs: [],
  githubJobs: [],
  locationFilteredJobs: [],
  locationFilterLocation: null,
  locationFilterNormalized: null,
  nextLinkedinScrape: null,
  nextLocationScrape: null,
  connectionStatus: "disconnected",
  isLoading: true,
  savedJobIds: new Set<string>(),
  dismissedJobIds: new Set<string>(),
  customSources: [],
  sourceStatuses: {},

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
        mathworksJobs: job.source === "MathWorks"
          ? [job, ...state.mathworksJobs]
          : state.mathworksJobs,
        githubJobs: job.source === "GitHub"
          ? [job, ...state.githubJobs]
          : state.githubJobs,
        locationFilteredJobs: matchesLocationFilter(job, state.locationFilterNormalized)
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
        jobrightJobs: state.jobrightJobs.filter((j) => j.external_id !== externalId),
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
      jobrightJobs: state.jobrightJobs.filter((j) => j.company !== company),
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
        jobrightJobs: updateList(state.jobrightJobs),
        mathworksJobs: updateList(state.mathworksJobs),
        githubJobs: updateList(state.githubJobs),
        locationFilteredJobs: updateList(state.locationFilteredJobs),
      };
    }),

  setJobs: (jobs) =>
    set((state) => {
      const filtered = jobs.filter((j) => !state.dismissedJobIds.has(j.external_id));
      return {
        jobs: filtered,
        linkedinJobs: filtered.filter((j) => j.source === "LinkedIn"),
        jobrightJobs: filtered.filter((j) => j.source === "Jobright"),
        mathworksJobs: filtered.filter((j) => j.source === "MathWorks"),
        githubJobs: filtered.filter((j) => j.source === "GitHub"),
        locationFilteredJobs: filtered.filter((j) => matchesLocationFilter(j, state.locationFilterNormalized)),
      };
    }),

  setLocationFilter: (location, normalized) =>
    set((state) => ({
      locationFilterLocation: location,
      locationFilterNormalized: normalized,
      locationFilteredJobs: state.jobs.filter((j) => matchesLocationFilter(j, normalized)),
    })),

  setNextScrape: (scraper, nextAt) =>
    set(scraper === "linkedin"
      ? { nextLinkedinScrape: nextAt }
      : { nextLocationScrape: nextAt }
    ),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setLoading: (isLoading) => set({ isLoading }),

  clearJobs: () =>
    set({
      jobs: [],
      linkedinJobs: [],
      jobrightJobs: [],
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

  updateCustomSource: (id, updates) =>
    set((state) => ({
      customSources: state.customSources.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  setSourceStatus: (id, status, message) =>
    set((state) => ({
      sourceStatuses: {
        ...state.sourceStatuses,
        [id]: { status, message },
      },
    })),
}));
