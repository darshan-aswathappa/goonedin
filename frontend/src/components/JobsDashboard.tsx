"use client";

import React, { useState, useRef, useEffect } from "react";
import { useJobsStore } from "@/store/jobs";
import { useShallow } from "zustand/react/shallow";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useJobsApi } from "@/hooks/useJobsApi";
import { JobList } from "./JobList";
import { ConnectionStatus } from "./ConnectionStatus";
import { AddJobSourceModal } from "./AddJobSourceModal";
import { OnboardingModal } from "./OnboardingModal";
import { LocationFilterInput } from "./LocationFilterInput";
import { ScrapeCountdown } from "./ScrapeCountdown";
import { ErrorBanner } from "./ErrorBanner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { useAuth, getAuthHeaders } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Chip, DsButton, DsCard, Kicker, dsButtonVariants } from "@/components/ds";
import { cn } from "@/lib/utils";
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
  PencilSimple,
  Trash,
  Tag,
  X,
  Code,
  MagnifyingGlass,
  Monitor,
  DotsThreeVertical,
  PlugsConnected,
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

/**
 * The `line` TabsList variant supplies the hairline rule and the brick active
 * underline; triggers only need to opt out of flex-grow so the strip scrolls.
 */
const TAB_BASE = "flex-none shrink-0 cursor-pointer";

/** 32px square hairline icon button used across the masthead. */
const HEADER_ICON_BUTTON =
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-hairline bg-paper-card text-ink-muted transition-colors duration-[120ms] hover:border-brick hover:text-brick";

const SOURCE_META_CHIP = "px-2 py-0.5 text-[11px] uppercase tracking-[0.09em]";

function JobrightEmptyState() {
  return (
    <DsCard
      interactive={false}
      className="flex flex-col items-center justify-center gap-4 px-5 py-16"
    >
      <div className="ds-well flex size-10 items-center justify-center">
        <PlugsConnected weight="regular" className="size-4 text-ink-muted" />
      </div>
      <div className="flex flex-col gap-1.5 text-center">
        <h3 className="font-serif text-[22px] font-semibold leading-tight text-ink">
          Connect Jobright
        </h3>
        <p className="max-w-[320px] font-sans text-[13px] leading-relaxed text-ink-muted">
          Add your Jobright credentials in Settings to pull personalized job
          recommendations.
        </p>
      </div>
      <Link
        href="/settings"
        className={cn(dsButtonVariants({ variant: "primary", size: "sm" }), "no-underline")}
      >
        <Gear weight="regular" className="size-4" />
        Set up in settings
      </Link>
    </DsCard>
  );
}

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
    indeedJobs,
    nextIndeedScrape,
    customSources,
    removeCustomSource,
    sourceStatuses,
    hasJobrightCreds,
  } = useJobsStore(
    useShallow((state) => ({
      jobs: state.jobs,
      apiError: state.apiError,
      setApiError: state.setApiError,
      linkedinJobs: state.linkedinJobs,
      jobrightJobs: state.jobrightJobs,
      mathworksJobs: state.mathworksJobs,
      githubJobs: state.githubJobs,
      indeedJobs: state.indeedJobs,
      locationFilteredJobs: state.locationFilteredJobs,
      locationFilterLocation: state.locationFilterLocation,
      locationFilterNormalized: state.locationFilterNormalized,
      nextLinkedinScrape: state.nextLinkedinScrape,
      nextLocationScrape: state.nextLocationScrape,
      nextIndeedScrape: state.nextIndeedScrape,
      customSources: state.customSources,
      removeCustomSource: state.removeCustomSource,
      sourceStatuses: state.sourceStatuses,
      hasJobrightCreds: state.hasJobrightCreds,
    })),
  );

  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const prevJobCountRef = useRef(jobs.length);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreMenuOpen]);
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
    return <IconComponent weight="regular" className="size-4 shrink-0" />;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <CircleNotch weight="regular" className="size-8 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Editorial masthead */}
      <header className="sticky top-0 z-40 h-14 border-b border-hairline bg-paper-card">
        <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center px-3">
          {/* Left: brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded-[4px] bg-brick">
              <Briefcase weight="fill" className="size-3.5 text-paper-card" />
            </div>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-serif text-[19px] font-semibold leading-none text-ink">
                Hirefeed
              </span>
              <Kicker className="text-[10px] leading-none">Job extraction engine</Kicker>
            </div>
          </div>

          {/* Center: live status + job count */}
          <div className="flex items-center justify-center gap-2">
            {user && (
              <>
                <span className="size-1.5 shrink-0 animate-live-pulse rounded-full bg-forest" />
                <span
                  key={countBumpKey}
                  className="animate-count-bump font-serif text-[17px] font-semibold tabular-nums text-ink"
                >
                  {jobs.length}
                </span>
                <Kicker>Jobs</Kicker>
              </>
            )}
          </div>

          {/* Right: action buttons */}
          {user && (
            <div className="flex items-center justify-end gap-1.5">
              <Link href="/saved" title="Saved jobs" aria-label="Saved jobs">
                <div className={HEADER_ICON_BUTTON}>
                  <BookmarkSimple weight="regular" className="size-4" />
                </div>
              </Link>

              {/* More menu: Settings, Keywords, Logs */}
              <div ref={moreMenuRef} className="relative">
                <button
                  onClick={() => setMoreMenuOpen((v) => !v)}
                  title="More"
                  aria-label="More"
                  aria-expanded={moreMenuOpen}
                  className={cn(
                    HEADER_ICON_BUTTON,
                    moreMenuOpen && "border-brick text-brick"
                  )}
                >
                  <DotsThreeVertical weight="regular" className="size-4" />
                </button>

                {moreMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[150px] overflow-hidden rounded-[4px] border border-hairline bg-paper-card">
                    {[
                      { href: "/settings", icon: <Gear weight="regular" className="size-4" />, label: "Settings" },
                      { href: "/keyword-matcher", icon: <Tag weight="regular" className="size-4" />, label: "Keywords" },
                      { href: "/logs", icon: <TerminalWindow weight="regular" className="size-4" />, label: "Logs" },
                    ].map(({ href, icon, label }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMoreMenuOpen(false)}
                        className="flex w-full items-center gap-2 border-b border-hairline px-3 py-2 font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted no-underline transition-colors duration-[120ms] last:border-b-0 hover:bg-paper-sunk hover:text-ink"
                      >
                        {icon}
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <ConnectionStatus />

              <button
                onClick={signOut}
                title="Sign Out"
                aria-label="Sign out"
                className={HEADER_ICON_BUTTON}
              >
                <SignOut weight="regular" className="size-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {user && <OnboardingModal userEmail={user.email} />}

      <main className="container mx-auto px-2 py-4 sm:px-3 sm:py-6">
        {apiError && (
          <ErrorBanner
            error={apiError}
            onDismiss={() => setApiError(null)}
            onRetry={retryFetch}
            showRetry={true}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className={!user ? "w-full mt-2 sm:mt-3" : "w-full"}>
          {user && (
            <div className="relative mb-4 flex w-full items-center gap-2 sm:mb-6">
              <TabsList
                variant="line"
                className="w-full max-w-full flex-nowrap justify-start overflow-x-auto whitespace-nowrap scrollbar-hide"
              >
                <TabsTrigger value="all" className={TAB_BASE}>
                  <div className="flex items-center gap-1.5">
                    <Globe weight="regular" className="size-4" />
                    <span>All</span>
                    <span className="text-ink-faint">{jobs.length}</span>
                  </div>
                </TabsTrigger>

                <TabsTrigger value="location" className={TAB_BASE}>
                  <div className="flex items-center gap-1.5">
                    <MapPin weight="regular" className="size-4" />
                    <span>{locationFilterNormalized?.abbreviation || "Location"}</span>
                    <span className="text-ink-faint">{locationFilteredJobs.length}</span>
                  </div>
                </TabsTrigger>

                {(linkedinJobs.length > 0 || activeTab === "linkedin") && (
                  <TabsTrigger value="linkedin" className={TAB_BASE}>
                    <div className="flex items-center gap-1.5">
                      <LinkedinLogo weight="regular" className="size-4" />
                      <span>LinkedIn</span>
                      <span className="text-ink-faint">{linkedinJobs.length}</span>
                    </div>
                  </TabsTrigger>
                )}

                {(jobrightJobs.length > 0 || activeTab === "jobright" || hasJobrightCreds) && (
                  <TabsTrigger value="jobright" className={TAB_BASE}>
                    <div className="flex items-center gap-1.5">
                      <Briefcase weight="regular" className="size-4" />
                      <span>Jobright</span>
                      <span className="text-ink-faint">{jobrightJobs.length}</span>
                    </div>
                  </TabsTrigger>
                )}

                {(mathworksJobs.length > 0 || activeTab === "mathworks") && (
                  <TabsTrigger value="mathworks" className={TAB_BASE}>
                    <div className="flex items-center gap-1.5">
                      <Buildings weight="regular" className="size-4" />
                      <span>MathWorks</span>
                      <span className="text-ink-faint">{mathworksJobs.length}</span>
                    </div>
                  </TabsTrigger>
                )}

                {(githubJobs.length > 0 || activeTab === "github") && (
                  <TabsTrigger value="github" className={TAB_BASE}>
                    <div className="flex items-center gap-1.5">
                      <GithubLogo weight="regular" className="size-4" />
                      <span>GitHub</span>
                      <span className="text-ink-faint">{githubJobs.length}</span>
                    </div>
                  </TabsTrigger>
                )}

                {(indeedJobs.length > 0 || activeTab === "indeed") && (
                  <TabsTrigger value="indeed" className={TAB_BASE}>
                    <div className="flex items-center gap-1.5">
                      <MagnifyingGlass weight="regular" className="size-4" />
                      <span>Indeed</span>
                      <span className="text-ink-faint">{indeedJobs.length}</span>
                    </div>
                  </TabsTrigger>
                )}

                {customSources.map((source) => {
                  const sourceJobs = jobs.filter((j) => j.source === source.name);
                  return (
                    <TabsTrigger
                      key={source.id}
                      value={source.id}
                      className={TAB_BASE}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        {getDynamicIcon(source.icon)}
                        <span className="truncate max-w-[80px] sm:max-w-[160px]">
                          {source.name}
                        </span>
                        <span className="shrink-0 text-ink-faint">{sourceJobs.length}</span>
                      </div>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <div className="shrink-0">
                <AddJobSourceModal
                  onSuccess={(id: string) => setActiveTab(id)}
                  triggerNode={
                    <DsButton
                      variant="secondary"
                      size="sm"
                      className="gap-1.5 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.09em]"
                    >
                      <span className="text-[13px] leading-none">+</span>
                      <span>Source</span>
                    </DsButton>
                  }
                />
              </div>
              <div className="pointer-events-none absolute right-8 top-0 h-full w-10 bg-gradient-to-l from-paper to-transparent md:hidden" aria-hidden="true" />
            </div>
          )}

          <TabsContent value="all" className="mt-0">
            <JobList
              jobs={jobs}
              emptyMessage="No jobs yet. We're searching now — check back soon."
              isLocked={!user}
              error={apiError}
              onRetry={retryFetch}
            />
          </TabsContent>

          <TabsContent value="location" className="mt-0">
            <div className="mb-4 flex flex-col gap-2 border-b border-hairline pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <Kicker className="text-ink-2">
                  {locationFilterNormalized?.full_name || "Location filter"}
                </Kicker>
                {locationFilterNormalized && (
                  <span className="flex flex-wrap items-center gap-2">
                    <Chip tone="sunk" className={SOURCE_META_CHIP}>
                      {locationFilterNormalized.abbreviation}
                    </Chip>
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
              <div className="mb-2">
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
            {!hasJobrightCreds && jobrightJobs.length === 0 ? (
              <JobrightEmptyState />
            ) : (
              <JobList
                jobs={jobrightJobs}
                emptyMessage="No Jobright jobs found yet. We'll update you as we discover them."
                isLocked={!user}
              />
            )}
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

          <TabsContent value="indeed" className="mt-0">
            {nextIndeedScrape && (
              <div className="mb-2">
                <ScrapeCountdown nextScrapeAt={nextIndeedScrape} />
              </div>
            )}
            <JobList
              jobs={indeedJobs}
              emptyMessage="No Indeed jobs found yet. Scanning every 10 minutes."
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
                {/* Custom source section header */}
                <div className="mb-4 flex flex-col gap-2 border-b border-hairline pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <Kicker className="text-ink-2">{source.name}</Kicker>
                    <span className="flex flex-wrap items-center gap-2">
                      <Chip tone="sunk" className={SOURCE_META_CHIP}>
                        {source.interval_minutes}m
                      </Chip>
                      <Chip tone="sunk" className={SOURCE_META_CHIP}>
                        {source.ttl_hours}h TTL
                      </Chip>
                    </span>
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <AddJobSourceModal
                      editSource={source}
                      triggerNode={
                        <DsButton
                          variant="secondary"
                          size="sm"
                          className="flex-1 gap-1.5 font-mono text-[11px] uppercase tracking-[0.09em] sm:flex-none"
                        >
                          <PencilSimple weight="regular" className="size-4 text-ink-muted" />
                          <span>Edit</span>
                        </DsButton>
                      }
                    />
                    <DsButton
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteSource(source.id, source.name)}
                      disabled={deletingSourceId === source.id}
                      className="flex-1 gap-1.5 font-mono text-[11px] uppercase tracking-[0.09em] sm:flex-none"
                    >
                      {deletingSourceId === source.id ? (
                        <CircleNotch weight="regular" className="size-4 animate-spin" />
                      ) : (
                        <Trash weight="regular" className="size-4" />
                      )}
                      <span>{deletingSourceId === source.id ? "Deleting" : "Delete"}</span>
                    </DsButton>
                  </div>
                </div>

                {(isProcessing || isError) && (
                  <div
                    className={cn(
                      "mb-4 rounded-[4px] border p-3",
                      isError ? "border-brick bg-brick-tint" : "border-hairline bg-paper-card"
                    )}
                  >
                    <div className="mb-2.5 flex items-center gap-2">
                      {isProcessing && (
                        <CircleNotch
                          weight="regular"
                          className="size-4 shrink-0 animate-spin text-ink-muted"
                        />
                      )}
                      {isError && (
                        <X weight="regular" className="size-4 shrink-0 text-ink-muted" />
                      )}
                      <span
                        className={cn(
                          "font-mono text-[11px] uppercase tracking-[0.09em]",
                          isError ? "text-brick" : "text-ink-2"
                        )}
                      >
                        {statusMessage || (isProcessing ? "Processing" : "Fetch failed")}
                      </span>
                    </div>
                    {isProcessing && (
                      <div className="h-0.5 w-full overflow-hidden bg-paper-sunk">
                        <div
                          className="h-full bg-brick transition-all duration-700 ease-out"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    )}
                    {isProcessing && (
                      <div className="mt-2 flex justify-between gap-1">
                        {["Queued", "Fetching", "Analyzing", "Done"].map((step, idx) => {
                          const stepStatuses = ["pending", "fetching", "parsing", "done"];
                          const currentIdx = stepStatuses.indexOf(status);
                          const isActive = idx <= currentIdx;
                          return (
                            <span
                              key={step}
                              className={cn(
                                "font-mono text-[10px] uppercase tracking-[0.09em]",
                                isActive ? "text-ink-2" : "text-ink-faint"
                              )}
                            >
                              {step}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {isError && (
                      <div className="mt-2.5">
                        <DsButton
                          variant="danger"
                          size="sm"
                          onClick={() => retryFetch()}
                          className="font-mono text-[11px] uppercase tracking-[0.09em]"
                        >
                          Retry
                        </DsButton>
                      </div>
                    )}
                  </div>
                )}

                <JobList
                  jobs={sourceJobs}
                  emptyMessage={isProcessing
                    ? `Processing ${source.name}. Jobs will appear here shortly.`
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
        theme="light"
        toastOptions={{
          style: {
            background: "var(--paper-card)",
            border: "1px solid var(--border-hairline)",
            color: "var(--ink)",
            borderRadius: "4px",
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
          },
        }}
      />
    </div>
  );
}
