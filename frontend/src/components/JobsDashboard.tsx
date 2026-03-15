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
  "font-mono text-[9px] tracking-widest uppercase font-semibold whitespace-nowrap shrink-0 bg-transparent border-0 border-b-2 border-transparent px-3 py-2.5 transition-colors cursor-pointer rounded-none h-auto data-[state=active]:border-[#ff8c00] data-[state=active]:text-[#ff8c00] data-[state=active]:bg-transparent text-[#555555] hover:text-[#aaaaaa]";

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
    return <IconComponent weight="bold" className="h-3.5 w-3.5" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#000" }}>
        <CircleNotch weight="bold" className="h-8 w-8 animate-spin" style={{ color: "#ff8c00" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-foreground font-medium transition-colors duration-300" style={{ background: "#000" }}>
      {/* Bloomberg terminal header */}
      <header
        className="sticky top-0 z-40"
        style={{ height: "44px", background: "#060606", borderBottom: "1px solid #1c1c1c" }}
      >
        <div
          className="h-full px-3 grid items-center"
          style={{ gridTemplateColumns: "1fr auto 1fr" }}
        >
          {/* Left: brand */}
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center"
              style={{ width: "22px", height: "22px", background: "#ff8c00" }}
            >
              <Briefcase weight="fill" className="h-3 w-3" style={{ color: "#000" }} />
            </div>
            <div className="flex flex-col leading-none gap-0.5">
              <span
                className="font-mono font-bold tracking-[0.2em] uppercase"
                style={{ fontSize: "11px", color: "#ff8c00" }}
              >
                HIREFEED
              </span>
              <span
                className="font-mono uppercase tracking-[0.12em]"
                style={{ fontSize: "9px", color: "#555" }}
              >
                JOB EXTRACTION ENGINE
              </span>
            </div>
          </div>

          {/* Center: live status + job count */}
          <div className="flex items-center justify-center gap-2">
            {user && (
              <>
                <span
                  className="animate-live-pulse rounded-full"
                  style={{ width: "6px", height: "6px", background: "#ff8c00", flexShrink: 0 }}
                />
                <span
                  key={countBumpKey}
                  className="font-mono font-bold tabular-nums animate-count-bump"
                  style={{ fontSize: "11px", color: "#ffd700" }}
                >
                  {jobs.length}
                </span>
                <span
                  className="font-mono uppercase tracking-widest"
                  style={{ fontSize: "9px", color: "#555" }}
                >
                  JOBS
                </span>
              </>
            )}
          </div>

          {/* Right: action buttons */}
          {user && (
            <div className="flex items-center justify-end gap-0.5">
              <Link href="/saved" title="Saved jobs">
                <div
                  className="flex items-center justify-center cursor-pointer transition-colors"
                  style={{
                    width: "32px",
                    height: "32px",
                    border: "1px solid #1c1c1c",
                    background: "transparent",
                    color: "#555",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.color = "#ff8c00"; (e.currentTarget as HTMLDivElement).style.borderColor = "#ff8c00"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.color = "#555"; (e.currentTarget as HTMLDivElement).style.borderColor = "#1c1c1c"; }}
                >
                  <BookmarkSimple weight="bold" className="h-3.5 w-3.5" />
                </div>
              </Link>

              {/* More menu: Settings, Keywords, Logs */}
              <div ref={moreMenuRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setMoreMenuOpen((v) => !v)}
                  title="More"
                  className="flex items-center justify-center cursor-pointer transition-colors"
                  style={{
                    width: "32px",
                    height: "32px",
                    border: `1px solid ${moreMenuOpen ? "#ff8c00" : "#1c1c1c"}`,
                    background: "transparent",
                    color: moreMenuOpen ? "#ff8c00" : "#555",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ff8c00"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff8c00"; }}
                  onMouseLeave={(e) => {
                    if (!moreMenuOpen) {
                      (e.currentTarget as HTMLButtonElement).style.color = "#555";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "#1c1c1c";
                    }
                  }}
                >
                  <DotsThreeVertical weight="bold" className="h-3.5 w-3.5" />
                </button>

                {moreMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 4px)",
                      background: "#0d0d0d",
                      border: "1px solid #2a2a2a",
                      minWidth: "130px",
                      zIndex: 50,
                    }}
                  >
                    {[
                      { href: "/settings", icon: <Gear weight="bold" className="h-3 w-3" />, label: "SETTINGS" },
                      { href: "/keyword-matcher", icon: <Tag weight="bold" className="h-3 w-3" />, label: "KEYWORDS" },
                      { href: "/logs", icon: <TerminalWindow weight="bold" className="h-3 w-3" />, label: "LOGS" },
                    ].map(({ href, icon, label }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMoreMenuOpen(false)}
                        className="flex items-center gap-2 w-full transition-colors"
                        style={{
                          padding: "8px 12px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          fontWeight: 600,
                          letterSpacing: "0.12em",
                          color: "#666",
                          borderBottom: "1px solid #1c1c1c",
                          textDecoration: "none",
                          display: "flex",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#ff8c00"; (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,140,0,0.05)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#666"; (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
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
                className="flex items-center justify-center cursor-pointer transition-colors"
                style={{
                  width: "32px",
                  height: "32px",
                  border: "1px solid #1c1c1c",
                  background: "transparent",
                  color: "#555",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ff3333"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff3333"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#555"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#1c1c1c"; }}
              >
                <SignOut weight="bold" className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {user && <OnboardingModal userEmail={user.email} />}

      <main className="container mx-auto px-2 sm:px-3 py-2 sm:py-3">
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
            <div className="relative flex items-center gap-2 w-full mb-2 sm:mb-3">
              <TabsList
                className="flex flex-nowrap h-auto gap-0 bg-transparent p-0 items-center justify-start border-none overflow-x-auto whitespace-nowrap scrollbar-hide w-full max-w-full"
                style={{ borderBottom: "1px solid #1c1c1c" }}
              >
                <TabsTrigger value="all" className={TAB_BASE}>
                  <div className="flex items-center gap-1.5">
                    <Globe weight="bold" className="h-3 w-3" />
                    <span>ALL</span>
                    <span style={{ color: "#555" }}>({jobs.length})</span>
                  </div>
                </TabsTrigger>

                <TabsTrigger value="location" className={TAB_BASE}>
                  <div className="flex items-center gap-1.5">
                    <MapPin weight="bold" className="h-3 w-3" />
                    <span>{locationFilterNormalized?.abbreviation || "LOCATION"}</span>
                    <span style={{ color: "#555" }}>({locationFilteredJobs.length})</span>
                  </div>
                </TabsTrigger>

                {(linkedinJobs.length > 0 || activeTab === "linkedin") && (
                  <TabsTrigger value="linkedin" className={TAB_BASE}>
                    <div className="flex items-center gap-1.5">
                      <LinkedinLogo weight="bold" className="h-3 w-3" />
                      <span>LINKEDIN</span>
                      <span style={{ color: "#555" }}>({linkedinJobs.length})</span>
                    </div>
                  </TabsTrigger>
                )}

                {(jobrightJobs.length > 0 || activeTab === "jobright") && (
                  <TabsTrigger value="jobright" className={TAB_BASE}>
                    <div className="flex items-center gap-1.5">
                      <Briefcase weight="bold" className="h-3 w-3" />
                      <span>JOBRIGHT</span>
                      <span style={{ color: "#555" }}>({jobrightJobs.length})</span>
                    </div>
                  </TabsTrigger>
                )}

                {(mathworksJobs.length > 0 || activeTab === "mathworks") && (
                  <TabsTrigger value="mathworks" className={TAB_BASE}>
                    <div className="flex items-center gap-1.5">
                      <Buildings weight="bold" className="h-3 w-3" />
                      <span>MATHWORKS</span>
                      <span style={{ color: "#555" }}>({mathworksJobs.length})</span>
                    </div>
                  </TabsTrigger>
                )}

                {(githubJobs.length > 0 || activeTab === "github") && (
                  <TabsTrigger value="github" className={TAB_BASE}>
                    <div className="flex items-center gap-1.5">
                      <GithubLogo weight="bold" className="h-3 w-3" />
                      <span>GITHUB</span>
                      <span style={{ color: "#555" }}>({githubJobs.length})</span>
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
                      <div className="flex items-center gap-1.5 min-w-0">
                        {getDynamicIcon(source.icon)}
                        <span className="truncate max-w-[80px] sm:max-w-[160px]">
                          {source.name.toUpperCase()}
                        </span>
                        <span style={{ color: "#555" }} className="shrink-0">({sourceJobs.length})</span>
                      </div>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <div className="shrink-0">
                <AddJobSourceModal
                  onSuccess={(id: string) => setActiveTab(id)}
                  triggerNode={
                    <button
                      className="font-mono uppercase tracking-widest transition-colors flex items-center gap-1.5"
                      style={{
                        fontSize: "9px",
                        fontWeight: 600,
                        border: "1px solid #1c1c1c",
                        background: "transparent",
                        color: "#555",
                        padding: "6px 10px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ff8c00"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff8c00"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#555"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#1c1c1c"; }}
                    >
                      <span style={{ fontSize: "11px", lineHeight: 1 }}>+</span>
                      <span>SOURCE</span>
                    </button>
                  }
                />
              </div>
              <div className="pointer-events-none absolute right-8 top-0 h-full w-10 bg-gradient-to-l from-black to-transparent md:hidden" aria-hidden="true" />
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
            <div
              className="flex flex-col gap-1 sm:gap-2 mb-2 sm:mb-3 pb-2 sm:flex-row sm:items-center sm:justify-between"
              style={{ borderBottom: "1px solid #1c1c1c" }}
            >
              <div className="flex flex-col gap-0.5">
                <span
                  className="font-mono font-semibold uppercase tracking-widest"
                  style={{ fontSize: "9px", color: "#ff8c00" }}
                >
                  {locationFilterNormalized?.full_name || "LOCATION FILTER"}
                </span>
                {locationFilterNormalized && (
                  <span className="flex gap-2 flex-wrap items-center" style={{ marginTop: "2px" }}>
                    <span
                      className="font-mono uppercase tracking-widest"
                      style={{
                        fontSize: "9px",
                        color: "#aaaaaa",
                        border: "1px solid #1c1c1c",
                        background: "#080808",
                        padding: "1px 6px",
                      }}
                    >
                      {locationFilterNormalized.abbreviation}
                    </span>
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
              <div className="mb-1.5">
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
                {/* Custom source section header */}
                <div
                  className="flex flex-col gap-1 sm:gap-2 mb-2 sm:mb-3 pb-2 sm:flex-row sm:items-center sm:justify-between"
                  style={{ borderBottom: "1px solid #1c1c1c" }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="font-mono font-semibold uppercase tracking-widest"
                      style={{ fontSize: "9px", color: "#ff8c00" }}
                    >
                      {source.name}
                    </span>
                    <span className="flex gap-2 flex-wrap items-center" style={{ marginTop: "2px" }}>
                      <span
                        className="font-mono uppercase tracking-widest"
                        style={{
                          fontSize: "9px",
                          color: "#aaaaaa",
                          border: "1px solid #1c1c1c",
                          background: "#080808",
                          padding: "1px 6px",
                        }}
                      >
                        {source.interval_minutes}m
                      </span>
                      <span
                        className="font-mono uppercase tracking-widest"
                        style={{
                          fontSize: "9px",
                          color: "#aaaaaa",
                          border: "1px solid #1c1c1c",
                          background: "#080808",
                          padding: "1px 6px",
                        }}
                      >
                        {source.ttl_hours}h TTL
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 w-full sm:w-auto">
                    <AddJobSourceModal
                      editSource={source}
                      triggerNode={
                        <button
                          className="font-mono uppercase tracking-widest transition-colors flex items-center gap-1 flex-1 sm:flex-none justify-center sm:justify-start"
                          style={{
                            fontSize: "9px",
                            fontWeight: 600,
                            border: "1px solid #1c1c1c",
                            background: "transparent",
                            color: "#ff8c00",
                            padding: "5px 10px",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff8c00"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,140,0,0.06)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1c1c1c"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          <PencilSimple weight="bold" className="h-3 w-3" />
                          <span>EDIT</span>
                        </button>
                      }
                    />
                    <button
                      onClick={() => handleDeleteSource(source.id, source.name)}
                      disabled={deletingSourceId === source.id}
                      className="font-mono uppercase tracking-widest transition-colors flex items-center gap-1 flex-1 sm:flex-none justify-center sm:justify-start disabled:opacity-40"
                      style={{
                        fontSize: "9px",
                        fontWeight: 600,
                        border: "1px solid #1c1c1c",
                        background: "transparent",
                        color: "#ff3333",
                        padding: "5px 10px",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff3333"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,51,51,0.06)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1c1c1c"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                    >
                      {deletingSourceId === source.id ? (
                        <CircleNotch weight="bold" className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash weight="bold" className="h-3 w-3" />
                      )}
                      <span>{deletingSourceId === source.id ? "DELETING..." : "DELETE"}</span>
                    </button>
                  </div>
                </div>

                {(isProcessing || isError) && (
                  <div
                    className="mb-2 sm:mb-3 p-3"
                    style={{
                      border: isError ? "1px solid #ff3333" : "1px solid #1c1c1c",
                      background: isError ? "rgba(255,51,51,0.05)" : "#080808",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      {isProcessing && (
                        <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin shrink-0" style={{ color: "#ff8c00" }} />
                      )}
                      {isError && (
                        <X weight="bold" className="h-3.5 w-3.5 shrink-0" style={{ color: "#ff3333" }} />
                      )}
                      <span
                        className="font-mono uppercase tracking-widest"
                        style={{
                          fontSize: "9px",
                          fontWeight: 600,
                          color: isError ? "#ff3333" : "#aaaaaa",
                        }}
                      >
                        {statusMessage || (isProcessing ? "PROCESSING..." : "FETCH FAILED")}
                      </span>
                    </div>
                    {isProcessing && (
                      <div
                        className="w-full h-0.5 overflow-hidden"
                        style={{ background: "#1c1c1c" }}
                      >
                        <div
                          className="h-full transition-all duration-700 ease-out"
                          style={{ width: `${progressPercent}%`, background: "#ff8c00" }}
                        />
                      </div>
                    )}
                    {isProcessing && (
                      <div className="flex justify-between mt-2 gap-1">
                        {["QUEUED", "FETCHING", "ANALYZING", "DONE"].map((step, idx) => {
                          const stepStatuses = ["pending", "fetching", "parsing", "done"];
                          const currentIdx = stepStatuses.indexOf(status);
                          const isActive = idx <= currentIdx;
                          return (
                            <span
                              key={step}
                              className="font-mono uppercase tracking-widest"
                              style={{
                                fontSize: "8px",
                                fontWeight: 600,
                                color: isActive ? "#ff8c00" : "#333",
                              }}
                            >
                              {step}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {isError && (
                      <div className="mt-2.5">
                        <button
                          onClick={() => retryFetch()}
                          className="font-mono uppercase tracking-widest transition-colors"
                          style={{
                            fontSize: "9px",
                            fontWeight: 600,
                            border: "1px solid #ff3333",
                            background: "transparent",
                            color: "#ff3333",
                            padding: "4px 10px",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,51,51,0.1)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          RETRY
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
        theme="dark"
        toastOptions={{
          style: {
            background: "#0d0d0d",
            border: "1px solid #2a2a2a",
            color: "#f0f0f0",
            borderRadius: "2px",
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: "11px",
            letterSpacing: "0.03em",
          },
        }}
      />
    </div>
  );
}
