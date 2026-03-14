"use client";

import React, { useState, useRef, useEffect } from "react";
import { useJobsStore } from "@/store/jobs";
import { useShallow } from "zustand/react/shallow";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useJobsApi } from "@/hooks/useJobsApi";
import { JobList } from "./JobList";
import { ConnectionStatus } from "./ConnectionStatus";
import { ThemeToggle } from "./ThemeToggle";
import { CompanyTicker } from "./CompanyTicker";
import { AddJobSourceModal } from "./AddJobSourceModal";
import { OnboardingModal } from "./OnboardingModal";
import { LocationFilterInput } from "./LocationFilterInput";
import { ScrapeCountdown } from "./ScrapeCountdown";
import { ErrorBanner } from "./ErrorBanner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { useAuth, getAuthHeaders } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Briefcase,
  Globe,
  CircleNotch,
  Buildings,
  LinkedinLogo,
  GithubLogo,
  MapPin,
  TerminalWindow,
  Gear,
  BookmarkSimple,
  SignOut,
  Sparkle,
  PencilSimple,
  Trash,
  Tag,
  X,
  Code,
  MagnifyingGlass,
  Monitor,
} from "@phosphor-icons/react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Buildings,
  Briefcase,
  Code,
  MagnifyingGlass,
  Monitor,
};
import Link from "next/link";

const TAB_BASE =
  "brutal-border rounded-none px-2 sm:px-4 py-2 sm:py-3 heading-brutal text-xs sm:text-sm shadow-[1px_1px_0px_0px_var(--border)] sm:shadow-[4px_4px_0px_0px_var(--border)] brutal-btn-hover whitespace-nowrap shrink-0";

export function JobsDashboard() {
  const { user, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("all");

  useWebSocket({ enabled: !!user });
  const { refetch: retryFetch } = useJobsApi(!!user);

  const {
    jobs,
    apiError,
    setApiError,
    linkedinJobs,
    jobrightJobs,
    mathworksJobs,
    githubJobs,
    locationFilteredJobs,
    locationFilterLocation,
    locationFilterNormalized,
    nextLinkedinScrape,
    nextLocationScrape,
    customSources,
    removeCustomSource,
    sourceStatuses,
  } = useJobsStore(
    useShallow((state) => ({
      jobs: state.jobs,
      apiError: state.apiError,
      setApiError: state.setApiError,
      linkedinJobs: state.linkedinJobs,
      jobrightJobs: state.jobrightJobs,
      mathworksJobs: state.mathworksJobs,
      githubJobs: state.githubJobs,
      locationFilteredJobs: state.locationFilteredJobs,
      locationFilterLocation: state.locationFilterLocation,
      locationFilterNormalized: state.locationFilterNormalized,
      nextLinkedinScrape: state.nextLinkedinScrape,
      nextLocationScrape: state.nextLocationScrape,
      customSources: state.customSources,
      removeCustomSource: state.removeCustomSource,
      sourceStatuses: state.sourceStatuses,
    })),
  );

  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const prevJobCountRef = useRef(jobs.length);
  const [countBumpKey, setCountBumpKey] = useState(0);
  useEffect(() => {
    if (jobs.length > prevJobCountRef.current) {
      setCountBumpKey((k) => k + 1);
    }
    prevJobCountRef.current = jobs.length;
  }, [jobs.length]);

  const handleDeleteSource = async (id: string, name: string) => {
      if (deletingSourceId) return;
      setDeletingSourceId(id);
      try {
          const headers = await getAuthHeaders();
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          let res: Response;
          try {
            res = await fetch(`${apiUrl}/config/custom-sources/${id}`, {
                method: "DELETE",
                headers,
                signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }

          if (!res.ok) {
              let errorMsg = "Failed to delete source";
              if (res.status === 409) {
                  errorMsg = "Can't delete yet. This source is still processing jobs. Please wait until it finishes.";
              } else if (res.status === 404) {
                  errorMsg = "Source not found. It may have been deleted already.";
              } else if (res.status >= 500) {
                  errorMsg = "Server error. Please try again later.";
              }
              toast.error(errorMsg);
              return;
          }

          removeCustomSource(id);
          setActiveTab("all");
          toast.success(`Deleted source: ${name}`);
      } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
              toast.error("Request timed out. Please check your connection and try again.");
          } else if (err instanceof TypeError) {
              toast.error("Network error. Check your connection and try again.");
          } else {
              toast.error("Failed to delete source. Please try again.");
          }
      } finally {
          setDeletingSourceId(null);
      }
  };

  const getDynamicIcon = (iconName: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const IconComponent: React.ComponentType<any> = ICON_MAP[iconName] ?? Buildings;
    return <IconComponent weight="bold" className="h-5 w-5" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <CircleNotch weight="bold" className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-medium transition-colors duration-300">
      <header className="brutal-border border-t-0 border-l-0 border-r-0 bg-card sticky top-0 z-40">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="brutal-border bg-primary p-1.5 sm:p-2 shadow-[2px_2px_0px_0px_var(--border)]">
                <Briefcase weight="fill" className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl heading-brutal leading-tight">
                  GoonedIn
                </h1>
                <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none">
                  Job Extraction Engine
                </p>
              </div>
            </div>

            {user && (
              <div className="flex items-center gap-1 sm:gap-2">
                <div className="brutal-border bg-card px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1.5 sm:gap-2 shadow-[1px_1px_0px_0px_var(--border)] sm:shadow-[2px_2px_0px_0px_var(--border)] h-10 sm:h-[42px]">
                  <Sparkle weight="fill" className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                  <span key={countBumpKey} className="font-black text-xs sm:text-sm animate-count-bump">{jobs.length}</span>
                </div>

                <div className="flex items-center gap-0.5 h-10 sm:h-[42px]">
                  <ThemeToggle />

                  <Link href="/saved" title="Saved jobs">
                    <div className="brutal-border brutal-btn-hover icon-btn bg-card text-green-600 dark:text-green-500">
                      <BookmarkSimple weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                  </Link>

                  <Link href="/settings" title="Settings">
                    <div className="brutal-border brutal-btn-hover icon-btn bg-card">
                      <Gear weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                  </Link>

                  <Link href="/keyword-matcher" title="Keywords">
                    <div className="brutal-border brutal-btn-hover icon-btn bg-card">
                      <Tag weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                  </Link>

                  <Link href="/logs" title="Logs">
                    <div className="brutal-border brutal-btn-hover icon-btn bg-card">
                      <TerminalWindow weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                  </Link>

                  <ConnectionStatus />

                  <button
                    onClick={signOut}
                    className="brutal-border brutal-btn-hover icon-btn bg-primary text-white"
                    title="Sign Out"
                  >
                    <SignOut weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {user && <OnboardingModal userEmail={user.email} />}

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {!user && <CompanyTicker />}

        {apiError && (
          <ErrorBanner
            error={apiError}
            onDismiss={() => setApiError(null)}
            onRetry={retryFetch}
            showRetry={true}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className={!user ? "w-full mt-6 sm:mt-8" : "w-full"}>
          {user && (
            <div className="relative flex items-center gap-1 sm:gap-3 w-full mb-6 sm:mb-10">
              <TabsList className="flex flex-nowrap h-auto gap-0.5 sm:gap-2 bg-transparent p-0 items-center justify-start border-none overflow-x-auto whitespace-nowrap scrollbar-hide w-full max-w-full pb-1 sm:pb-2">
                <TabsTrigger
                value="all"
                className={`${TAB_BASE} data-[state=active]:bg-primary data-[state=active]:text-white`}
              >
                <div className="flex items-center gap-1 sm:gap-2">
                  <Globe weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>All</span>
                  <span className="text-xs sm:text-sm">({jobs.length})</span>
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="location"
                className={`${TAB_BASE} data-[state=active]:bg-primary data-[state=active]:text-white`}
              >
                <div className="flex items-center gap-1 sm:gap-2">
                  <MapPin weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="text-xs sm:text-sm">{locationFilterNormalized?.abbreviation || "Location"}</span>
                  <span className="text-xs">({locationFilteredJobs.length})</span>
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="linkedin"
                className={`${TAB_BASE} data-[state=active]:bg-[#0A66C2] data-[state=active]:text-white`}
              >
                <div className="flex items-center gap-1 sm:gap-2">
                  <LinkedinLogo weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>LinkedIn</span>
                  <span className="text-xs">({linkedinJobs.length})</span>
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="jobright"
                className={`${TAB_BASE} data-[state=active]:bg-[#5465FF] data-[state=active]:text-white`}
              >
                <div className="flex items-center gap-1 sm:gap-2">
                  <Briefcase weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>Jobright</span>
                  <span className="text-xs">({jobrightJobs.length})</span>
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="mathworks"
                className={`${TAB_BASE} data-[state=active]:bg-[#ED1C24] data-[state=active]:text-white`}
              >
                <div className="flex items-center gap-1 sm:gap-2">
                  <Buildings weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>MathWorks</span>
                  <span className="text-xs">({mathworksJobs.length})</span>
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="github"
                className={`${TAB_BASE} data-[state=active]:bg-[#24292e] data-[state=active]:text-white`}
              >
                <div className="flex items-center gap-1 sm:gap-2">
                  <GithubLogo weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>GitHub</span>
                  <span className="text-xs">({githubJobs.length})</span>
                </div>
              </TabsTrigger>

              {customSources.map((source) => {
                const sourceJobs = jobs.filter((j) => j.source === source.name);
                return (
                  <TabsTrigger
                    key={source.id}
                    value={source.id}
                    className={`${TAB_BASE} data-[state=active]:bg-foreground data-[state=active]:text-background`}
                  >
                    <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                      {getDynamicIcon(source.icon)}
                      <span className="truncate text-xs sm:text-sm max-w-[80px] sm:max-w-[200px]">
                        {source.name}
                      </span>
                      <span className="text-xs shrink-0">({sourceJobs.length})</span>
                    </div>
                  </TabsTrigger>
                );
              })}

              </TabsList>

              <div className="shrink-0 pb-1 sm:pb-2">
                <AddJobSourceModal onSuccess={(id: string) => setActiveTab(id)} />
              </div>
              <div className="pointer-events-none absolute right-8 top-0 h-full w-10 bg-gradient-to-l from-background to-transparent md:hidden" aria-hidden="true" />
            </div>
          )}

          <TabsContent value="all" className="mt-0">
            <JobList
              jobs={jobs}
              emptyMessage="No jobs yet. We're searching now—check back soon."
              isLocked={!user}
              error={apiError}
              onRetry={retryFetch}
            />
          </TabsContent>

          <TabsContent value="location" className="mt-0">
            <div className="flex flex-col gap-2 sm:gap-3 mb-4 sm:mb-6 pb-2 sm:pb-3 border-b-4 border-border border-dotted sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-0.5 sm:gap-1">
                <span className="font-black uppercase tracking-tighter text-base sm:text-xl">
                  {locationFilterNormalized?.full_name || "Location Filter"}
                </span>
                {locationFilterNormalized && (
                  <span className="font-bold text-xs text-muted-foreground flex gap-1 sm:gap-2 flex-wrap">
                    <span className="brutal-badge bg-red-100 dark:bg-red-900/50 text-foreground">{locationFilterNormalized.abbreviation}</span>
                    <ScrapeCountdown nextScrapeAt={nextLocationScrape} />
                  </span>
                )}
              </div>
              <LocationFilterInput />
            </div>
            <JobList
              jobs={locationFilteredJobs}
              emptyMessage={
                locationFilterLocation
                  ? `No jobs found in ${locationFilterNormalized?.full_name || locationFilterLocation} yet. We're searching for them.`
                  : "Set a location above to filter jobs by state or city."
              }
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="linkedin" className="mt-0">
            {nextLinkedinScrape && (
              <div className="mb-4">
                <ScrapeCountdown nextScrapeAt={nextLinkedinScrape} />
              </div>
            )}
            <JobList
              jobs={linkedinJobs}
              emptyMessage="No LinkedIn jobs found yet. We'll update you as we discover them."
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="jobright" className="mt-0">
            <JobList
              jobs={jobrightJobs}
              emptyMessage="No Jobright jobs found yet. We'll update you as we discover them."
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="mathworks" className="mt-0">
            <JobList
              jobs={mathworksJobs}
              emptyMessage="No MathWorks jobs found yet. We'll update you as we discover them."
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="github" className="mt-0">
            <JobList
              jobs={githubJobs}
              emptyMessage="No GitHub jobs found yet. We'll update you as we discover them."
              isLocked={!user}
            />
          </TabsContent>

          {customSources.map((source) => {
            const sourceJobs = jobs.filter((j) => j.source === source.name);
            const liveStatus = sourceStatuses[source.id];
            const status = liveStatus?.status || source.status || "done";
            const statusMessage = liveStatus?.message || source.status_message || "";
            const isProcessing = status === "pending" || status === "fetching" || status === "parsing";
            const isError = status === "error";
            const progressPercent = status === "pending" ? 10 : status === "fetching" ? 40 : status === "parsing" ? 75 : 100;
            return (
              <TabsContent key={source.id} value={source.id} className="mt-0">
                <div className="flex flex-col gap-2 sm:gap-3 mb-4 sm:mb-6 pb-2 sm:pb-3 border-b-4 border-border border-dotted sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-0.5 sm:gap-1">
                     <span className="font-black uppercase tracking-tighter text-base sm:text-xl">{source.name}</span>
                     <span className="font-bold text-xs text-muted-foreground flex gap-1 sm:gap-2 flex-wrap">
                        <span className="brutal-badge bg-yellow-100 dark:bg-yellow-900/50 text-foreground">{source.interval_minutes}m</span>
                        <span className="brutal-badge bg-blue-100 dark:bg-blue-900/50 text-foreground">{source.ttl_hours}h</span>
                     </span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto">
                    <AddJobSourceModal
                      editSource={source}
                      triggerNode={
                        <button className="brutal-border px-2 sm:px-3 py-1 sm:py-1.5 font-bold text-xs sm:text-sm bg-amber-300 text-black brutal-btn-hover flex items-center gap-1 shadow-[1px_1px_0px_0px_var(--border)] sm:shadow-[2px_2px_0px_0px_var(--border)] flex-1 sm:flex-none justify-center sm:justify-start">
                          <PencilSimple weight="bold" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                      }
                    />
                    <button
                      onClick={() => handleDeleteSource(source.id, source.name)}
                      disabled={deletingSourceId === source.id}
                      className="brutal-border px-2 sm:px-3 py-1 sm:py-1.5 font-bold text-xs sm:text-sm bg-destructive text-white brutal-btn-hover flex items-center gap-1 shadow-[1px_1px_0px_0px_var(--border)] sm:shadow-[2px_2px_0px_0px_var(--border)] flex-1 sm:flex-none justify-center sm:justify-start disabled:opacity-50"
                    >
                      {deletingSourceId === source.id ? (
                        <CircleNotch weight="bold" className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                      ) : (
                        <Trash weight="bold" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      )}
                      <span className="hidden sm:inline">{deletingSourceId === source.id ? "Deleting..." : "Delete"}</span>
                    </button>
                  </div>
                </div>

                {(isProcessing || isError) && (
                  <div className={`brutal-border mb-4 sm:mb-6 p-3 sm:p-4 shadow-[2px_2px_0px_0px_var(--border)] sm:shadow-[4px_4px_0px_0px_var(--border)] ${
                    isError ? "bg-destructive/10 dark:bg-destructive/20 border-destructive" : "bg-card"
                  }`}>
                    <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                      {isProcessing && (
                        <CircleNotch weight="bold" className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-primary" />
                      )}
                      {isError && (
                        <X weight="bold" className="h-4 w-4 sm:h-5 sm:w-5 text-destructive shrink-0" />
                      )}
                      <span className={`heading-brutal text-xs sm:text-sm ${
                        isError ? "text-destructive" : "text-foreground"
                      }`}>
                        {statusMessage || (isProcessing ? "Processing..." : "Fetch failed")}
                      </span>
                    </div>
                    {isProcessing && (
                      <div className="w-full bg-muted brutal-border h-2 sm:h-3 overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-700 ease-out"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    )}
                    {isProcessing && (
                      <div className="flex justify-between mt-1.5 sm:mt-2 gap-1">
                        {["Queued", "Fetching", "Analyzing", "Done"].map((step, idx) => {
                          const stepStatuses = ["pending", "fetching", "parsing", "done"];
                          const currentIdx = stepStatuses.indexOf(status);
                          const isActive = idx <= currentIdx;
                          return (
                            <span key={step} className={`text-[8px] sm:text-[10px] font-black uppercase tracking-wider ${
                              isActive ? "text-primary" : "text-muted-foreground/40"
                            }`}>
                              {step}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {isError && (
                      <div className="mt-2 sm:mt-3 flex gap-1 sm:gap-2">
                        <button
                          onClick={() => retryFetch()}
                          className="brutal-border px-2.5 sm:px-4 py-1 sm:py-2 font-bold text-xs sm:text-sm bg-red-600 text-white brutal-btn-hover shadow-[1px_1px_0px_0px_var(--border)] sm:shadow-[2px_2px_0px_0px_var(--border)]"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <JobList
                  jobs={sourceJobs}
                  emptyMessage={isProcessing
                    ? `Processing ${source.name}... Jobs will appear here shortly.`
                    : `Searching ${source.name} for jobs. This may take a few minutes.`
                  }
                  isLocked={!user}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "brutal-border brutal-shadow rounded-none bg-card text-foreground",
        }}
      />
    </div>
  );
}
